import { and, eq, isNull } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { db, schema } from "../../db/client.js";
import { buildMemoryText } from "../agentMemoriesService.js";
import { chunkText, computeContentHash, resolveActiveEmbeddingModel } from "../embeddingService.js";
import { extractTextFromLexical } from "../entityDetector.js";
import { updateJobProgress } from "../agentJobsRepository.js";
import { listMemories } from "../agentMemoriesRepository.js";
import {
    buildLorebookEntryText,
    buildNoteText,
    buildOutlineItemText,
    indexAgentMemory,
    indexChapter,
    indexLorebookEntry,
    indexNote,
    indexOutlineItem,
    removeEntityFromIndex
} from "../ragIndexService.js";
import type { RagEntityType } from "../ragRepository.js";

type ChunkSummary = { chunkIndex: number; contentHash: string; embeddingModel: string | null };

// True if the entity's current text no longer matches what's actually indexed: a different
// chunk count, any positional content-hash mismatch, any existing chunk whose embedding never
// landed (a prior index attempt that ran while the embedding endpoint was down), or — since the
// local in-process embedding backend was added — any chunk embedded by a since-abandoned
// model/backend (activeModel is null when no embedding provider is configured at all, in which
// case a model mismatch can't be evaluated and is skipped, same as the existing null-embedding
// case already tolerating an unavailable endpoint). All are safe to fix the same way —
// indexLorebookEntry/indexChapter/etc. fully replace an entity's chunks per call, so a redundant
// reindex is a no-op cost-wise, not a correctness risk. See docs/Local_Embeddings_Design.md for
// why mixing embedding spaces in one vector index must never happen.
const entityNeedsReindex = (currentText: string, existingChunks: ChunkSummary[], activeModel: string | null): boolean => {
    const expectedTexts = chunkText(currentText);
    if (expectedTexts.length !== existingChunks.length) return true;

    const sorted = [...existingChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    for (let i = 0; i < expectedTexts.length; i++) {
        if (sorted[i].embeddingModel === null) return true;
        if (activeModel !== null && sorted[i].embeddingModel !== activeModel) return true;
        if (sorted[i].contentHash !== computeContentHash(expectedTexts[i])) return true;
    }
    return false;
};

type ReconcileCounts = { checked: number; reindexed: number };
type ReconcileStoryResult = {
    lorebookEntries: ReconcileCounts;
    chapters: ReconcileCounts;
    memories: ReconcileCounts;
    notes: ReconcileCounts;
    outlineItems: ReconcileCounts;
    orphansRemoved: number;
};

// Finds RAG index drift for one story and fixes it using the existing (unmodified)
// ragIndexService.ts primitives — this job only adds the "what's out of sync" query layer,
// which didn't exist before Phase A. Kinds of drift:
//   1. stale/missing/wrong-model chunks for a still-live lorebook entry, chapter, active agent
//      memory, armed note, or armed outline item -> reindex it
//   2. orphaned chunks whose source entity no longer exists (e.g. the lorebook delete-route
//      gap this same phase fixes) -> remove them
// Memories/notes/outline items were previously only checked for orphan-removal, never for
// staleness — a real pre-existing gap, closed here (needed regardless of the embedding-backend
// motivation: those chunks could otherwise drift from edited content forever, since none of them
// re-run this job's own staleness check on their own).
const reconcileOneStory = async (
    storyId: string,
    job: AgentJob,
    activeModel: string | null
): Promise<ReconcileStoryResult> => {
    const [entries, chapterRows, chunkRows, activeMemories, armedNotes, armedOutlineItems] = await Promise.all([
        db
            .select()
            .from(schema.lorebookEntries)
            .where(and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId), isNull(schema.lorebookEntries.deletedAt))),
        db.select().from(schema.chapters).where(and(eq(schema.chapters.storyId, storyId), isNull(schema.chapters.deletedAt))),
        db
            .select({
                entityType: schema.ragChunks.entityType,
                entityId: schema.ragChunks.entityId,
                chunkIndex: schema.ragChunks.chunkIndex,
                contentHash: schema.ragChunks.contentHash,
                embeddingModel: schema.ragChunks.embeddingModel
            })
            .from(schema.ragChunks)
            .where(eq(schema.ragChunks.storyId, storyId)),
        listMemories({ storyId, status: "active" }),
        db
            .select()
            .from(schema.notes)
            .where(and(eq(schema.notes.storyId, storyId), eq(schema.notes.includeInAi, true), isNull(schema.notes.deletedAt))),
        db
            .select()
            .from(schema.outlineItems)
            .where(and(eq(schema.outlineItems.storyId, storyId), eq(schema.outlineItems.includeInAi, true), isNull(schema.outlineItems.deletedAt)))
    ]);

    const chunksByKey = new Map<string, ChunkSummary[]>();
    for (const row of chunkRows) {
        const key = `${row.entityType}:${row.entityId}`;
        const list = chunksByKey.get(key) ?? [];
        list.push({ chunkIndex: row.chunkIndex, contentHash: row.contentHash, embeddingModel: row.embeddingModel });
        chunksByKey.set(key, list);
    }

    const validKeys = new Set<string>();
    const totalToCheck =
        entries.length + chapterRows.length + activeMemories.length + armedNotes.length + armedOutlineItems.length;
    let checkedSoFar = 0;
    let lorebookReindexed = 0;
    let chapterReindexed = 0;
    let memoryReindexed = 0;
    let noteReindexed = 0;
    let outlineItemReindexed = 0;

    const reportProgress = async (message: string) => {
        checkedSoFar++;
        if (checkedSoFar % 10 === 0 || checkedSoFar === totalToCheck)
            await updateJobProgress(job.id, { processed: checkedSoFar, total: totalToCheck, message });
    };

    for (const entry of entries) {
        const key = `lorebook_entry:${entry.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = await buildLorebookEntryText(entry);

        if (entityNeedsReindex(currentText, existingChunks, activeModel)) {
            await indexLorebookEntry(entry.id);
            lorebookReindexed++;
        }
        await reportProgress(`Checked lorebook entry ${entry.name}`);
    }

    for (const chapter of chapterRows) {
        const key = `chapter:${chapter.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = extractTextFromLexical(chapter.content);

        if (entityNeedsReindex(currentText, existingChunks, activeModel)) {
            await indexChapter(chapter.id);
            chapterReindexed++;
        }
        await reportProgress(`Checked chapter ${chapter.title}`);
    }

    for (const memory of activeMemories) {
        const key = `agent_memory:${memory.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = buildMemoryText(memory);

        if (entityNeedsReindex(currentText, existingChunks, activeModel)) {
            await indexAgentMemory({ memoryId: memory.id, storyId, text: currentText });
            memoryReindexed++;
        }
        await reportProgress(`Checked memory ${memory.title}`);
    }

    for (const note of armedNotes) {
        const key = `note:${note.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = buildNoteText(note);

        if (entityNeedsReindex(currentText, existingChunks, activeModel)) {
            await indexNote({ noteId: note.id, storyId, text: currentText });
            noteReindexed++;
        }
        await reportProgress(`Checked note ${note.title}`);
    }

    for (const item of armedOutlineItems) {
        const key = `outline_item:${item.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = buildOutlineItemText(item);

        if (entityNeedsReindex(currentText, existingChunks, activeModel)) {
            await indexOutlineItem({ outlineItemId: item.id, storyId, text: currentText });
            outlineItemReindexed++;
        }
        await reportProgress(`Checked outline item ${item.title}`);
    }

    // Orphan pass: any indexed key with no corresponding live entity/chapter/memory/note/outline
    // item left — e.g. from the lorebook DELETE route gap fixed alongside this job, or any other
    // path that forgets the same cleanup call in the future.
    let orphansRemoved = 0;
    for (const key of chunksByKey.keys()) {
        if (validKeys.has(key)) continue;
        const [entityType, entityId] = key.split(":") as [RagEntityType, string];
        removeEntityFromIndex(entityType, entityId);
        orphansRemoved++;
    }

    return {
        lorebookEntries: { checked: entries.length, reindexed: lorebookReindexed },
        chapters: { checked: chapterRows.length, reindexed: chapterReindexed },
        memories: { checked: activeMemories.length, reindexed: memoryReindexed },
        notes: { checked: armedNotes.length, reindexed: noteReindexed },
        outlineItems: { checked: armedOutlineItems.length, reindexed: outlineItemReindexed },
        orphansRemoved
    };
};

const sumCounts = (a: ReconcileCounts, b: ReconcileCounts): ReconcileCounts => ({
    checked: a.checked + b.checked,
    reindexed: a.reindexed + b.reindexed
});

// job.storyId === null means "run across every story" — used by the "Rebuild embedding index"
// Settings action (docs/Local_Embeddings_Design.md) after switching the embedding provider, so
// nothing is left mixing embedding spaces anywhere in the app, not just in one story. Mirrors
// prune_history's existing "some jobs are global" precedent (agentJobs.storyId is already
// nullable for exactly this) rather than introducing a second job type.
export const runReconcileIndexJob = async (
    job: AgentJob
): Promise<({ storyId: string } | { storiesChecked: number }) & ReconcileStoryResult> => {
    const activeModel = await resolveActiveEmbeddingModel();

    if (job.storyId) {
        const result = await reconcileOneStory(job.storyId, job, activeModel);
        return { storyId: job.storyId, ...result };
    }

    const stories = await db.select({ id: schema.stories.id }).from(schema.stories).where(isNull(schema.stories.deletedAt));
    let aggregate: ReconcileStoryResult = {
        lorebookEntries: { checked: 0, reindexed: 0 },
        chapters: { checked: 0, reindexed: 0 },
        memories: { checked: 0, reindexed: 0 },
        notes: { checked: 0, reindexed: 0 },
        outlineItems: { checked: 0, reindexed: 0 },
        orphansRemoved: 0
    };

    for (const story of stories) {
        const result = await reconcileOneStory(story.id, job, activeModel);
        aggregate = {
            lorebookEntries: sumCounts(aggregate.lorebookEntries, result.lorebookEntries),
            chapters: sumCounts(aggregate.chapters, result.chapters),
            memories: sumCounts(aggregate.memories, result.memories),
            notes: sumCounts(aggregate.notes, result.notes),
            outlineItems: sumCounts(aggregate.outlineItems, result.outlineItems),
            orphansRemoved: aggregate.orphansRemoved + result.orphansRemoved
        };
    }

    return { storiesChecked: stories.length, ...aggregate };
};
