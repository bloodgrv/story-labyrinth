import { and, eq } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { db, schema } from "../../db/client.js";
import { chunkText, computeContentHash } from "../embeddingService.js";
import { extractTextFromLexical } from "../entityDetector.js";
import { updateJobProgress } from "../agentJobsRepository.js";
import { buildLorebookEntryText, indexChapter, indexLorebookEntry, removeEntityFromIndex } from "../ragIndexService.js";
import type { RagEntityType } from "../ragRepository.js";

type ChunkSummary = { chunkIndex: number; contentHash: string; embeddingModel: string | null };

// True if the entity's current text no longer matches what's actually indexed: a different
// chunk count, any positional content-hash mismatch, or any existing chunk whose embedding
// never landed (a prior index attempt that ran while the embedding endpoint was down). All
// three are safe to fix the same way — indexLorebookEntry/indexChapter fully replace an
// entity's chunks per call, so a redundant reindex is a no-op cost-wise, not a correctness risk.
const entityNeedsReindex = (currentText: string, existingChunks: ChunkSummary[]): boolean => {
    const expectedTexts = chunkText(currentText);
    if (expectedTexts.length !== existingChunks.length) return true;

    const sorted = [...existingChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    for (let i = 0; i < expectedTexts.length; i++) {
        if (sorted[i].embeddingModel === null) return true;
        if (sorted[i].contentHash !== computeContentHash(expectedTexts[i])) return true;
    }
    return false;
};

// Finds RAG index drift for one story and fixes it using the existing (unmodified)
// ragIndexService.ts primitives — this job only adds the "what's out of sync" query layer,
// which didn't exist before Phase A. Two kinds of drift:
//   1. stale/missing chunks for a still-live lorebook entry or chapter -> reindex it
//   2. orphaned chunks whose source entity no longer exists (e.g. the lorebook delete-route
//      gap this same phase fixes) -> remove them
export const runReconcileIndexJob = async (job: AgentJob): Promise<{
    storyId: string;
    lorebookEntries: { checked: number; reindexed: number };
    chapters: { checked: number; reindexed: number };
    orphansRemoved: number;
}> => {
    if (!job.storyId) throw new Error("reconcile_index job requires storyId");
    const storyId = job.storyId;

    const [entries, chapterRows, chunkRows] = await Promise.all([
        db
            .select()
            .from(schema.lorebookEntries)
            .where(and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))),
        db.select().from(schema.chapters).where(eq(schema.chapters.storyId, storyId)),
        db
            .select({
                entityType: schema.ragChunks.entityType,
                entityId: schema.ragChunks.entityId,
                chunkIndex: schema.ragChunks.chunkIndex,
                contentHash: schema.ragChunks.contentHash,
                embeddingModel: schema.ragChunks.embeddingModel
            })
            .from(schema.ragChunks)
            .where(eq(schema.ragChunks.storyId, storyId))
    ]);

    const chunksByKey = new Map<string, ChunkSummary[]>();
    for (const row of chunkRows) {
        const key = `${row.entityType}:${row.entityId}`;
        const list = chunksByKey.get(key) ?? [];
        list.push({ chunkIndex: row.chunkIndex, contentHash: row.contentHash, embeddingModel: row.embeddingModel });
        chunksByKey.set(key, list);
    }

    const validKeys = new Set<string>();
    const totalToCheck = entries.length + chapterRows.length;
    let checkedSoFar = 0;
    let lorebookReindexed = 0;
    let chapterReindexed = 0;

    const reportProgress = async (message: string) => {
        checkedSoFar++;
        if (checkedSoFar % 10 === 0 || checkedSoFar === totalToCheck)
            await updateJobProgress(job.id, { processed: checkedSoFar, total: totalToCheck, message });
    };

    for (const entry of entries) {
        const key = `lorebook_entry:${entry.id}`;
        validKeys.add(key);
        const existingChunks = chunksByKey.get(key) ?? [];
        const currentText = buildLorebookEntryText(entry);

        if (entityNeedsReindex(currentText, existingChunks)) {
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

        if (entityNeedsReindex(currentText, existingChunks)) {
            await indexChapter(chapter.id);
            chapterReindexed++;
        }
        await reportProgress(`Checked chapter ${chapter.title}`);
    }

    // Orphan pass: any indexed key with no corresponding live entity/chapter left — e.g. from
    // the lorebook DELETE route gap fixed alongside this job, or any other path that forgets
    // the same cleanup call in the future.
    let orphansRemoved = 0;
    for (const key of chunksByKey.keys()) {
        if (validKeys.has(key)) continue;
        const [entityType, entityId] = key.split(":") as [RagEntityType, string];
        removeEntityFromIndex(entityType, entityId);
        orphansRemoved++;
    }

    return {
        storyId,
        lorebookEntries: { checked: entries.length, reindexed: lorebookReindexed },
        chapters: { checked: chapterRows.length, reindexed: chapterReindexed },
        orphansRemoved
    };
};
