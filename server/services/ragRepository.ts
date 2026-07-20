import { randomUUID } from "node:crypto";
import { sqlite } from "../db/client.js";
import { computeContentHash } from "./embeddingService.js";

export type RagEntityType = "lorebook_entry" | "chapter" | "agent_memory" | "note" | "outline_item";

// Single source of truth for "entityTypes omitted" — every caller in the codebase (routes/rag.ts,
// ragScanner.ts, chatContextService.ts) either passes this explicitly or omits the param and
// inherits it here. Must never silently mean "all types" (design doc §4.5) — pending/active
// memories, and notes/outline items, only ever surface via an explicit opt-in entityTypes
// argument (Notes_Outline_Chat_Bridges_Design.md's double gate).
export const DEFAULT_SEARCH_ENTITY_TYPES: RagEntityType[] = ["lorebook_entry", "chapter"];

export interface RagChunkRow {
    id: string;
    storyId: string;
    entityType: RagEntityType;
    entityId: string;
    chunkIndex: number;
    content: string;
    contentHash: string;
    embeddingModel: string | null;
    embeddedAt: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface SearchResult {
    chunkId: string;
    entityType: RagEntityType;
    entityId: string;
    chunkIndex: number;
    content: string;
    score: number;
    matchedBy: "keyword" | "vector" | "both";
}

// Delete a chunk's rows from all three tables (metadata + vector + keyword index).
// Prepared inline (not hoisted to module scope) — these tables are created by migrations,
// which run after this module is first imported, so preparing at import time would fail
// against a database that hasn't been migrated yet.
const deleteChunkEverywhere = (chunkId: string) => {
    sqlite.prepare("DELETE FROM ragChunks WHERE id = ?").run(chunkId);
    sqlite.prepare("DELETE FROM vec_chunks WHERE chunkId = ?").run(chunkId);
    sqlite.prepare("DELETE FROM fts_chunks WHERE chunkId = ?").run(chunkId);
};

// Remove all indexed chunks for a given entity (lorebook entry or chapter).
// Call this when the source entity is deleted, or before re-chunking on update.
export const deleteChunksForEntity = (entityType: RagEntityType, entityId: string): void => {
    const existing = sqlite
        .prepare("SELECT id FROM ragChunks WHERE entityType = ? AND entityId = ?")
        .all(entityType, entityId) as { id: string }[];

    const tx = sqlite.transaction(() => {
        for (const row of existing) deleteChunkEverywhere(row.id);
    });
    tx();
};

// Replace all chunks for an entity with a fresh set derived from `texts`.
// Returns the newly-created metadata rows (all require embedding + FTS indexing).
export const replaceChunksForEntity = (params: {
    storyId: string;
    entityType: RagEntityType;
    entityId: string;
    texts: string[];
}): RagChunkRow[] => {
    const { storyId, entityType, entityId, texts } = params;

    const insertChunk = sqlite.prepare(`
        INSERT INTO ragChunks
            (id, storyId, entityType, entityId, chunkIndex, content, contentHash, embeddingModel, embeddedAt, createdAt, updatedAt)
        VALUES (@id, @storyId, @entityType, @entityId, @chunkIndex, @content, @contentHash, NULL, NULL, @now, @now)
    `);

    const created: RagChunkRow[] = [];

    const tx = sqlite.transaction(() => {
        deleteChunksForEntity(entityType, entityId);

        const now = Date.now();
        texts.forEach((content, chunkIndex) => {
            const row = {
                id: randomUUID(),
                storyId,
                entityType,
                entityId,
                chunkIndex,
                content,
                contentHash: computeContentHash(content),
                now
            };
            insertChunk.run(row);
            created.push({
                id: row.id,
                storyId,
                entityType,
                entityId,
                chunkIndex,
                content,
                contentHash: row.contentHash,
                embeddingModel: null,
                embeddedAt: null,
                createdAt: now,
                updatedAt: now
            });
        });
    });
    tx();

    return created;
};

// Store computed embeddings for a batch of chunks and index their text for keyword search.
// `embedding: null` means no embedding endpoint was available for this batch (see
// ragIndexService.ts's indexEntity) — the chunk still gets indexed for keyword/FTS search,
// it just won't surface via vector search until it's re-indexed with embeddings available.
export const saveEmbeddings = (
    rows: { id: string; storyId: string; content: string; embedding: number[] | null }[],
    model: string
): void => {
    if (rows.length === 0) return;

    const insertVec = sqlite.prepare(
        "INSERT INTO vec_chunks (storyId, embedding, chunkId) VALUES (?, ?, ?)"
    );
    const insertFts = sqlite.prepare("INSERT INTO fts_chunks (content, chunkId, storyId) VALUES (?, ?, ?)");
    const updateChunk = sqlite.prepare(
        "UPDATE ragChunks SET embeddingModel = ?, embeddedAt = ?, updatedAt = ? WHERE id = ?"
    );
    const clearVecRow = sqlite.prepare("DELETE FROM vec_chunks WHERE chunkId = ?");
    const clearFtsRow = sqlite.prepare("DELETE FROM fts_chunks WHERE chunkId = ?");

    const tx = sqlite.transaction(() => {
        const now = Date.now();
        for (const row of rows) {
            // Defensive: clear any stale rows before inserting (should not normally exist yet).
            clearVecRow.run(row.id);
            clearFtsRow.run(row.id);

            if (row.embedding) insertVec.run(row.storyId, new Float32Array(row.embedding), row.id);
            insertFts.run(row.content, row.id, row.storyId);
            updateChunk.run(row.embedding ? model : null, now, now, row.id);
        }
    });
    tx();
};

// Escape a raw user query into a safe FTS5 MATCH expression: quote each token individually
// (implicit AND between them) so punctuation/operators in the input can't break the query syntax.
const toFtsQuery = (queryText: string): string | null => {
    const tokens = queryText
        .split(/\s+/)
        .map(t => t.replace(/"/g, "").trim())
        .filter(Boolean);
    if (tokens.length === 0) return null;
    return tokens.map(t => `"${t}"`).join(" ");
};

const RRF_K = 60;

// Hybrid search: combine FTS5 keyword matches and sqlite-vec similarity matches via
// Reciprocal Rank Fusion, then hydrate the merged chunk ids with their full content.
//
// entityTypes filtering (Phase B): `vec_chunks`/`fts_chunks` carry no entityType column of their
// own. For FTS this is filtered precisely via a subquery against ragChunks alongside the MATCH
// clause — fts_chunks is a standalone table with no virtual-table restrictions on that. For vec,
// `storyId` is declared a sqlite-vec PARTITION KEY (see migration 0009_rag_vector_search.sql)
// but `chunkId` is just a plain auxiliary column — combining an arbitrary chunkId-subquery filter
// with `MATCH ... AND k = ?` is not a construct sqlite-vec is documented to support, so the vec
// query itself stays unfiltered by entityType (still partition-filtered by storyId as before)
// and the filter is applied at the metadata-hydration step below instead. Known, accepted
// tradeoff: when a caller passes a restrictive entityTypes filter, vec-sourced candidates are
// filtered *after* RRF ranking rather than during the KNN query, so the result count can
// occasionally come in under `limit` if excluded-type chunks occupied ranked slots. This never
// affects the default (unfiltered) path every existing caller uses today.
export const hybridSearch = (params: {
    storyId: string;
    queryText: string;
    queryEmbedding: number[] | null;
    limit?: number;
    entityTypes?: RagEntityType[];
}): SearchResult[] => {
    const { storyId, queryText, queryEmbedding, limit = 10, entityTypes = DEFAULT_SEARCH_ENTITY_TYPES } = params;
    const candidatePoolSize = Math.max(limit * 3, 20);
    const typePlaceholders = entityTypes.map(() => "?").join(",");

    const rrfScores = new Map<string, { score: number; matchedBy: Set<"keyword" | "vector"> }>();

    const ftsQuery = toFtsQuery(queryText);
    if (ftsQuery) {
        const ftsRows = sqlite
            .prepare(
                `SELECT chunkId FROM fts_chunks
                 WHERE fts_chunks MATCH ? AND storyId = ?
                   AND chunkId IN (SELECT id FROM ragChunks WHERE entityType IN (${typePlaceholders}))
                 ORDER BY rank LIMIT ?`
            )
            .all(ftsQuery, storyId, ...entityTypes, candidatePoolSize) as { chunkId: string }[];

        ftsRows.forEach((row, rank) => {
            const entry = rrfScores.get(row.chunkId) ?? { score: 0, matchedBy: new Set() };
            entry.score += 1 / (RRF_K + rank + 1);
            entry.matchedBy.add("keyword");
            rrfScores.set(row.chunkId, entry);
        });
    }

    if (queryEmbedding) {
        const vecRows = sqlite
            .prepare(
                `SELECT chunkId FROM vec_chunks WHERE embedding MATCH ? AND storyId = ? AND k = ? ORDER BY distance`
            )
            .all(new Float32Array(queryEmbedding), storyId, candidatePoolSize) as { chunkId: string }[];

        vecRows.forEach((row, rank) => {
            const entry = rrfScores.get(row.chunkId) ?? { score: 0, matchedBy: new Set() };
            entry.score += 1 / (RRF_K + rank + 1);
            entry.matchedBy.add("vector");
            rrfScores.set(row.chunkId, entry);
        });
    }

    const allCandidates = [...rrfScores.entries()].sort((a, b) => b[1].score - a[1].score);
    if (allCandidates.length === 0) return [];

    // Hydrate ALL ranked candidates first (not just the top `limit`), then filter by entityType,
    // then slice to `limit` — this is where the vec side's entityType filter is actually applied
    // (see the comment above). FTS candidates are already type-filtered at the source, so this
    // is a no-op re-check for them, not double work that changes their ranking.
    const candidatePlaceholders = allCandidates.map(() => "?").join(",");
    const metaRows = sqlite
        .prepare(
            `SELECT id, entityType, entityId, chunkIndex, content FROM ragChunks
             WHERE id IN (${candidatePlaceholders}) AND entityType IN (${typePlaceholders})`
        )
        .all(...allCandidates.map(([chunkId]) => chunkId), ...entityTypes) as Pick<
        RagChunkRow,
        "id" | "entityType" | "entityId" | "chunkIndex" | "content"
    >[];
    const metaById = new Map(metaRows.map(row => [row.id, row]));
    const ranked = allCandidates.filter(([chunkId]) => metaById.has(chunkId)).slice(0, limit);

    return ranked
        .map(([chunkId, { score, matchedBy }]) => {
            const meta = metaById.get(chunkId);
            if (!meta) return null;
            return {
                chunkId,
                entityType: meta.entityType,
                entityId: meta.entityId,
                chunkIndex: meta.chunkIndex,
                content: meta.content,
                score,
                matchedBy: matchedBy.size === 2 ? "both" : ([...matchedBy][0] as "keyword" | "vector")
            } satisfies SearchResult;
        })
        .filter((r): r is SearchResult => r !== null);
};
