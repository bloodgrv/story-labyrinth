import { and, eq, inArray, or } from "drizzle-orm";
import type { CodexCustomField, CodexState, CodexStateItem } from "../../src/types/codex.js";
import { STORY_GRAPH_EDGE_TYPE_LABELS } from "../../src/types/storyGraph.js";
import type { StoryGraphEdgeType } from "../../src/types/storyGraph.js";
import type { PlaceState } from "../../src/types/story.js";
import { db, schema } from "../db/client.js";
import { chunkText, embedTexts } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import {
    deleteChunksForEntity,
    getLastIndexedAt,
    hybridSearch,
    type RagEntityType,
    replaceChunksForEntity,
    saveEmbeddings,
    type SearchResult
} from "./ragRepository.js";

type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

const formatCodexState = (state: CodexState | null): string => {
    if (!state) return "";

    const lines: string[] = [];
    const section = (label: string, items: CodexStateItem[] | undefined) => {
        if (items?.length) lines.push(`${label}: ${items.map(i => i.value).join("; ")}`);
    };
    const labeledFields = (fields: CodexCustomField[] | undefined) => {
        for (const field of fields ?? []) lines.push(field.label ? `${field.label}: ${field.value}` : field.value);
    };

    section("Wardrobe", state.wardrobe);
    labeledFields(state.appearance);
    section("Wounds", state.wounds);
    section("Items", state.items);
    labeledFields(state.customFields);

    // Secrets (2026-08-14) — the RAG index is a static per-entry blob, computed once on save, not
    // per-request, so it has no way to know "which chapter is this search happening for." Only
    // the manual `revealed` gate applies here — never the chapter-scoped auto-reveal, which needs
    // request-time chapter context and is handled separately in chatContextService.ts's anchor-
    // entry resolution instead. An unrevealed secret must NEVER reach this function's output.
    const revealedSecrets = (state.secrets ?? []).filter(s => s.revealed);
    if (revealedSecrets.length) lines.push(`Secrets (revealed): ${revealedSecrets.map(s => s.value).join("; ")}`);

    return lines.join("\n");
};

// T5 FS6 (docs/Lore_Sheet_And_Sync_Design.md §7) — location's light place sheet
// (entry.metadata.placeState) can drift from the Lore Sheet's own text (it's editable
// independently via PlaceSheetFields.tsx / the place-sheet-proposal chat fence, not just through
// Sync), so it's worth surfacing to RAG in its own right. `layoutMd` is deliberately omitted here:
// it's the same content the location sheet template's own "Layout Notes" heading carries (see
// reverseCompileSheet.ts), so including it here would just duplicate that section verbatim.
const formatPlaceState = (placeState: PlaceState | null | undefined): string => {
    if (!placeState) return "";

    const lines: string[] = [];
    if (placeState.scale?.trim()) lines.push(`Scale: ${placeState.scale.trim()}`);
    if (placeState.biomeOrClimate?.trim()) lines.push(`Biome/Climate: ${placeState.biomeOrClimate.trim()}`);
    if (placeState.holder?.trim()) lines.push(`Holder: ${placeState.holder.trim()}`);
    if (placeState.dangerLevel?.trim()) lines.push(`Danger Level: ${placeState.dangerLevel.trim()}`);
    if (placeState.landmarks?.length) lines.push(`Landmarks: ${placeState.landmarks.join("; ")}`);
    if (placeState.exitsSummary?.trim()) lines.push(`Exits: ${placeState.exitsSummary.trim()}`);
    if (placeState.floorLabel?.trim()) lines.push(`Floor: ${placeState.floorLabel.trim()}`);

    return lines.length ? `Place details:\n${lines.join("\n")}` : "";
};

// Plain-text summary of this entry's active Relationship Graph edges (P1.2 G1.5+,
// docs/CURRENT_BACKLOG.md's "reindex lorebook text when edges change so RAG sees
// relationships"). Both endpoints of an edge get the exact same sentence — direction is
// preserved in the text itself (fromName - label - toName), not rephrased per perspective, so
// this needs no reverse-semantic label mapping. Rejected/pending edges are deliberately excluded
// — only what's actually true should be searchable fact.
const buildRelationshipText = async (entryId: string): Promise<string> => {
    const edges = await db
        .select()
        .from(schema.storyGraphEdges)
        .where(
            and(
                eq(schema.storyGraphEdges.status, "active"),
                or(eq(schema.storyGraphEdges.fromId, entryId), eq(schema.storyGraphEdges.toId, entryId))
            )
        );
    if (edges.length === 0) return "";

    const otherIds = new Set<string>();
    for (const edge of edges) {
        otherIds.add(edge.fromId);
        otherIds.add(edge.toId);
    }
    const nameRows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(inArray(schema.lorebookEntries.id, [...otherIds]));
    const nameById = new Map(nameRows.map(r => [r.id, r.name]));

    const lines = edges.map(edge => {
        const fromName = nameById.get(edge.fromId) ?? edge.fromId;
        const toName = nameById.get(edge.toId) ?? edge.toId;
        const label = edge.label || STORY_GRAPH_EDGE_TYPE_LABELS[edge.edgeType as StoryGraphEdgeType] || edge.edgeType;
        return `${fromName} — ${label} — ${toName}`;
    });
    return `Relationships:\n${lines.join("\n")}`;
};

// Exported for reconcileIndexJob.ts's staleness check, so it recomputes indexable text the
// exact same way indexLorebookEntry does and can't drift from what actually gets indexed. Async
// since P1.2 G1.5+ added a relationship-edge lookup — see buildRelationshipText above.
//
// T5 FS6 (docs/Lore_Sheet_And_Sync_Design.md §7) — once an entry has a non-empty Lore Sheet, the
// sheet is the authored source of truth and `description` is a stale/legacy narrative dump next
// to it (Sync already compiles the sheet's narrative sections back into `description`, so
// including both would mostly duplicate text). Entries that never got a sheet keep indexing on
// `description` exactly as before.
export const buildLorebookEntryText = async (entry: LorebookRow): Promise<string> => {
    // Drizzle's `mode: "json"` column already deserializes this to an object on select.
    const codexText = formatCodexState((entry.codexState as CodexState | null) ?? null);
    const relationshipText = await buildRelationshipText(entry.id);
    const sheetBody = (entry.sheetBody as string | null)?.trim() ?? "";

    if (sheetBody) {
        const placeText =
            entry.category === "location"
                ? formatPlaceState((entry.metadata as { placeState?: PlaceState } | null)?.placeState)
                : "";
        return [entry.name, sheetBody, codexText, placeText, relationshipText].filter(Boolean).join("\n\n");
    }

    return [entry.name, entry.description, codexText, relationshipText].filter(Boolean).join("\n\n");
};

// Exported (moved here from routes/notes.ts and routes/outline.ts) so reconcileIndexJob.ts's
// staleness check can recompute the same indexable text those routes' own sync-on-write calls
// use, without a services→routes layering inversion.
export const buildNoteText = (note: Pick<typeof schema.notes.$inferSelect, "title" | "content">): string =>
    [note.title, note.content].filter(Boolean).join("\n\n");

export const buildOutlineItemText = (item: Pick<typeof schema.outlineItems.$inferSelect, "title" | "summary">): string =>
    [item.title, item.summary].filter(Boolean).join("\n\n");

// Only story-level entries map to a single concrete story. Global/series-level entries can
// apply across many stories at once, so they're excluded from indexing in this phase —
// see DECISIONS.md for the tradeoff.
const resolveLorebookStoryId = (entry: LorebookRow): string | null =>
    entry.level === "story" ? entry.scopeId : null;

const indexEntity = async (params: {
    storyId: string;
    entityType: RagEntityType;
    entityId: string;
    text: string;
}): Promise<{ indexed: boolean; chunks: number }> => {
    const { storyId, entityType, entityId, text } = params;

    if (!text.trim()) {
        deleteChunksForEntity(entityType, entityId);
        return { indexed: false, chunks: 0 };
    }

    const texts = chunkText(text);
    const rows = replaceChunksForEntity({ storyId, entityType, entityId, texts });
    if (rows.length === 0) return { indexed: false, chunks: 0 };

    // Mirrors search()'s own fallback below: an unavailable embedding endpoint shouldn't block
    // indexing entirely — chunks still get keyword/FTS-indexed, just without vector search
    // until a later re-index picks up embeddings.
    let embeddings: { embedding: number[]; model: string }[] | null = null;
    try {
        embeddings = await embedTexts(rows.map(r => r.content));
    } catch (error) {
        console.warn(
            `RAG indexing: embedding unavailable for ${entityType}:${entityId}, indexing keyword-only:`,
            (error as Error).message
        );
    }

    const model = embeddings?.[0]?.model ?? "none";
    saveEmbeddings(
        rows.map((row, i) => ({
            id: row.id,
            storyId: row.storyId,
            content: row.content,
            embedding: embeddings ? embeddings[i].embedding : null
        })),
        model
    );

    return { indexed: true, chunks: rows.length };
};

// (Re)index a lorebook entry: builds searchable text from name/description/codex state,
// chunks it, embeds each chunk, and stores the result. Safe to call repeatedly — it fully
// replaces the entry's previous chunks each time.
export const indexLorebookEntry = async (entryId: string): Promise<{ indexed: boolean; chunks: number }> => {
    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (!entry) throw new Error(`Lorebook entry not found: ${entryId}`);

    const storyId = resolveLorebookStoryId(entry);
    if (!storyId) {
        deleteChunksForEntity("lorebook_entry", entryId);
        return { indexed: false, chunks: 0 };
    }

    return indexEntity({ storyId, entityType: "lorebook_entry", entityId: entryId, text: await buildLorebookEntryText(entry) });
};

// (Re)index a chapter: extracts plain text from the Lexical editor content, chunks it,
// embeds each chunk, and stores the result.
export const indexChapter = async (chapterId: string): Promise<{ indexed: boolean; chunks: number }> => {
    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const text = extractTextFromLexical(chapter.content);
    return indexEntity({ storyId: chapter.storyId, entityType: "chapter", entityId: chapterId, text });
};

// B36 (docs/CODE_REVIEW_2026-08-17.md) — chapter reindexing was client-triggered only
// (SaveChapterContentPlugin.tsx's own 8s-debounced fetch), so a tab closed right after a save
// left that content unindexed until the next ~15min reconcile_index sweep. This is the
// server-side backstop, called fire-and-forget from chapters.ts's PUT route on every
// content-bearing save so convergence never depends on the client tab staying open — throttled
// (not "reindex on every save") since indexEntity always fully re-chunks/re-embeds, a real
// per-call AI/compute cost that a 1s-debounced-content-save cadence would otherwise multiply. In
// the common case (client stays open, actively typing) the client's own faster 8s debounce
// already keeps the index fresh, so this mostly no-ops (skipped by the throttle) — it only does
// real work when the client-side path didn't get a chance to run.
const CHAPTER_REINDEX_THROTTLE_S = 60;

export const maybeIndexChapter = async (chapterId: string): Promise<void> => {
    // B43 — getLastIndexedAt returns epoch seconds (ragChunks' own convention), so this compares
    // in seconds too, not ms.
    const lastIndexedAt = getLastIndexedAt("chapter", chapterId);
    if (lastIndexedAt !== null && Math.floor(Date.now() / 1000) - lastIndexedAt < CHAPTER_REINDEX_THROTTLE_S) return;
    await indexChapter(chapterId).catch(error =>
        console.error(`RAG indexing: server-side chapter reindex failed for ${chapterId}:`, (error as Error).message)
    );
};

// Remove an entity's chunks from the index entirely (e.g. after the source entity is deleted).
export const removeEntityFromIndex = (entityType: RagEntityType, entityId: string): void => {
    deleteChunksForEntity(entityType, entityId);
};

// (Re)index an approved/edited agent memory (Phase B). Caller (agentMemoriesService.ts) builds
// the indexable text and resolves storyId — global (storyId: null) memories never reach this
// function at all, since hybridSearch is always story-scoped and a global memory has nowhere to
// attach a ragChunks.storyId to. Same shape as indexLorebookEntry/indexChapter, just thinner
// since there's no separate "load the row" step here (the caller already has it).
export const indexAgentMemory = async (params: {
    memoryId: string;
    storyId: string;
    text: string;
}): Promise<{ indexed: boolean; chunks: number }> =>
    indexEntity({ storyId: params.storyId, entityType: "agent_memory", entityId: params.memoryId, text: params.text });

// (Re)index a Story Note, only ever called when the note's own includeInAi flag is true (see
// routes/notes.ts) — notes are opt-in working material, not always-on like lorebook/chapter. Same
// thin shape as indexAgentMemory: caller already has the row and builds the indexable text.
export const indexNote = async (params: {
    noteId: string;
    storyId: string;
    text: string;
}): Promise<{ indexed: boolean; chunks: number }> =>
    indexEntity({ storyId: params.storyId, entityType: "note", entityId: params.noteId, text: params.text });

// (Re)index an Outline item, only ever called when the item's own includeInAi flag is true (see
// routes/outline.ts) — same opt-in posture as indexNote.
export const indexOutlineItem = async (params: {
    outlineItemId: string;
    storyId: string;
    text: string;
}): Promise<{ indexed: boolean; chunks: number }> =>
    indexEntity({ storyId: params.storyId, entityType: "outline_item", entityId: params.outlineItemId, text: params.text });

// Hybrid keyword + vector search scoped to a single story. Falls back to keyword-only
// search if no embedding endpoint is configured, rather than failing outright. `entityTypes` is
// passed straight through with no re-defaulting — hybridSearch's own DEFAULT_SEARCH_ENTITY_TYPES
// is the single source of truth for what "omitted" means (design doc §4.5: default must exclude
// agent_memory, never silently mean "all types").
export const search = async (params: {
    storyId: string;
    query: string;
    limit?: number;
    entityTypes?: RagEntityType[];
}): Promise<SearchResult[]> => {
    const { storyId, query, limit, entityTypes } = params;

    let queryEmbedding: number[] | null = null;
    try {
        const [result] = await embedTexts([query]);
        queryEmbedding = result?.embedding ?? null;
    } catch (error) {
        console.warn("RAG search: embedding unavailable, falling back to keyword-only search:", (error as Error).message);
    }

    return hybridSearch({ storyId, queryText: query, queryEmbedding, limit, entityTypes });
};
