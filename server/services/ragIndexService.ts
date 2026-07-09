import { eq } from "drizzle-orm";
import type { CodexCustomField, CodexState, CodexStateItem } from "../../src/types/codex.js";
import { db, schema } from "../db/client.js";
import { chunkText, embedTexts } from "./embeddingService.js";
import { extractTextFromLexical } from "./entityDetector.js";
import {
    deleteChunksForEntity,
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

    section("Wardrobe", state.wardrobe);
    section("Appearance", state.appearance);
    section("Wounds", state.wounds);
    section("Items", state.items);
    for (const field of state.customFields ?? []) lines.push(`${field.label}: ${(field as CodexCustomField).value}`);

    return lines.join("\n");
};

const buildLorebookEntryText = (entry: LorebookRow): string => {
    // Drizzle's `mode: "json"` column already deserializes this to an object on select.
    const codexText = formatCodexState((entry.codexState as CodexState | null) ?? null);
    return [entry.name, entry.description, codexText].filter(Boolean).join("\n\n");
};

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

    return indexEntity({ storyId, entityType: "lorebook_entry", entityId: entryId, text: buildLorebookEntryText(entry) });
};

// (Re)index a chapter: extracts plain text from the Lexical editor content, chunks it,
// embeds each chunk, and stores the result.
export const indexChapter = async (chapterId: string): Promise<{ indexed: boolean; chunks: number }> => {
    const [chapter] = await db.select().from(schema.chapters).where(eq(schema.chapters.id, chapterId));
    if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);

    const text = extractTextFromLexical(chapter.content);
    return indexEntity({ storyId: chapter.storyId, entityType: "chapter", entityId: chapterId, text });
};

// Remove an entity's chunks from the index entirely (e.g. after the source entity is deleted).
export const removeEntityFromIndex = (entityType: RagEntityType, entityId: string): void => {
    deleteChunksForEntity(entityType, entityId);
};

// Hybrid keyword + vector search scoped to a single story. Falls back to keyword-only
// search if no embedding endpoint is configured, rather than failing outright.
export const search = async (params: { storyId: string; query: string; limit?: number }): Promise<SearchResult[]> => {
    const { storyId, query, limit } = params;

    let queryEmbedding: number[] | null = null;
    try {
        const [result] = await embedTexts([query]);
        queryEmbedding = result?.embedding ?? null;
    } catch (error) {
        console.warn("RAG search: embedding unavailable, falling back to keyword-only search:", (error as Error).message);
    }

    return hybridSearch({ storyId, queryText: query, queryEmbedding, limit });
};
