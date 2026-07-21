import { STORY_GRAPH_EDGE_TYPES } from "../../src/types/storyGraph.js";
import type {
    StoryGraphEdge,
    StoryGraphEdgeType,
    StoryGraphMigrationResult,
    StoryGraphNode,
    StoryGraphResponse,
    StoryGraphStatus
} from "../../src/types/storyGraph.js";
import { parseJson } from "../lib/json.js";
import {
    deleteEdgeRow,
    deleteEdgesForEntity as deleteEdgesForEntityRow,
    findActiveEdge,
    getEdge,
    insertEdge,
    type LorebookRow,
    listActiveEdgesForStory,
    listPendingEdgesForStory,
    listVisibleEntriesForStory,
    updateEdgeRow
} from "./storyGraphRepository.js";

// Sits over storyGraphRepository.ts the same way codexService.ts sits over codexRepository.ts:
// the repository is pure DB access, this layer owns validation, dedup enforcement, node/edge DTO
// assembly, and the metadata.relationships migration.

type RawEdgeRow = Awaited<ReturnType<typeof getEdge>>;

const rowToEdge = (row: NonNullable<RawEdgeRow>): StoryGraphEdge => ({
    id: row.id,
    storyId: row.storyId,
    fromId: row.fromId,
    toId: row.toId,
    edgeType: row.edgeType as StoryGraphEdgeType,
    label: row.label ?? null,
    description: row.description ?? null,
    status: row.status as StoryGraphStatus,
    asOfChapterId: row.asOfChapterId ?? null,
    source: row.source as StoryGraphEdge["source"],
    createdAt: row.createdAt as unknown as Date,
    updatedAt: (row.updatedAt as unknown as Date | null) ?? null
});

const isValidEdgeType = (value: string): value is StoryGraphEdgeType =>
    STORY_GRAPH_EDGE_TYPES.includes(value as StoryGraphEdgeType);

const validateEdgeType = (value: string): void => {
    if (!isValidEdgeType(value)) throw new Error(`edgeType must be one of: ${STORY_GRAPH_EDGE_TYPES.join(", ")}`);
};

type MetadataRelationship = { targetId: string; type: string; description?: string };
type LorebookMetadata = { importance?: "major" | "minor" | "background"; relationships?: MetadataRelationship[] };

const readMetadata = (row: LorebookRow): LorebookMetadata | null =>
    (parseJson(row.metadata as string | null | undefined) as LorebookMetadata | null) ?? null;

const rowToNode = (row: LorebookRow): StoryGraphNode => ({
    id: row.id,
    name: row.name,
    category: row.category,
    level: row.level as StoryGraphNode["level"],
    isDisabled: !!row.isDisabled,
    imageFilename: row.imageFilename ?? null,
    importance: readMetadata(row)?.importance ?? null
});

// ── Edge CRUD ──────────────────────────────────────────────────────────────────

export type CreateEdgeInput = {
    storyId: string;
    fromId: string;
    toId: string;
    edgeType: string;
    label?: string | null;
    description?: string | null;
    status?: "active" | "pending";
};

export const createEdge = async (input: CreateEdgeInput): Promise<StoryGraphEdge> => {
    validateEdgeType(input.edgeType);
    if (input.fromId === input.toId) throw new Error("An edge cannot connect an entry to itself");

    const visibleEntries = await listVisibleEntriesForStory(input.storyId);
    const visibleIds = new Set(visibleEntries.map(e => e.id));
    if (!visibleIds.has(input.fromId)) throw new Error(`fromId does not resolve to an entry visible to this story: ${input.fromId}`);
    if (!visibleIds.has(input.toId)) throw new Error(`toId does not resolve to an entry visible to this story: ${input.toId}`);

    const status = input.status ?? "active";
    // Dedup only guards active edges — duplicate pending proposals are harmless (no unique
    // constraint blocks them) and shouldn't block a "propose for review" action.
    if (status === "active") {
        const existing = await findActiveEdge(input.storyId, input.fromId, input.toId, input.edgeType);
        if (existing) throw new Error("An active edge of this type already exists between these entries");
    }

    const row = await insertEdge({
        storyId: input.storyId,
        fromId: input.fromId,
        toId: input.toId,
        edgeType: input.edgeType,
        label: input.label ?? null,
        description: input.description ?? null,
        status,
        source: "user"
    });
    return rowToEdge(row);
};

export type UpdateEdgeInput = { edgeType?: string; label?: string | null; description?: string | null };

export const updateEdge = async (id: string, input: UpdateEdgeInput): Promise<StoryGraphEdge> => {
    if (input.edgeType !== undefined) validateEdgeType(input.edgeType);
    const row = await updateEdgeRow(id, input);
    if (!row) throw new Error(`Edge not found: ${id}`);
    return rowToEdge(row);
};

export const deleteEdge = async (id: string): Promise<void> => {
    await deleteEdgeRow(id);
};

// ── Pending-edge review ────────────────────────────────────────────────────────

export type PendingEdgeWithNames = { edge: StoryGraphEdge; fromName: string; toName: string };

// Names resolved server-side rather than left to the frontend's already-loaded node list:
// getStoryGraph's node set only includes global/series entries referenced by an *active* edge,
// so a pending edge between two such entries wouldn't otherwise resolve a name client-side.
export const listPendingEdges = async (storyId: string): Promise<PendingEdgeWithNames[]> => {
    const [rows, visibleEntries] = await Promise.all([listPendingEdgesForStory(storyId), listVisibleEntriesForStory(storyId)]);
    const nameById = new Map(visibleEntries.map(e => [e.id, e.name]));
    return rows.map(row => {
        const edge = rowToEdge(row);
        return { edge, fromName: nameById.get(edge.fromId) ?? edge.fromId, toName: nameById.get(edge.toId) ?? edge.toId };
    });
};

export const approveEdge = async (id: string): Promise<StoryGraphEdge> => {
    const existing = await getEdge(id);
    if (!existing) throw new Error(`Edge not found: ${id}`);
    if (existing.status !== "pending") throw new Error(`Edge is not pending (status: ${existing.status})`);

    const conflict = await findActiveEdge(existing.storyId, existing.fromId, existing.toId, existing.edgeType);
    if (conflict) throw new Error("An active edge of this type already exists between these entries");

    const row = await updateEdgeRow(id, { status: "active" });
    if (!row) throw new Error(`Edge not found: ${id}`);
    return rowToEdge(row);
};

export const rejectEdge = async (id: string): Promise<StoryGraphEdge> => {
    const existing = await getEdge(id);
    if (!existing) throw new Error(`Edge not found: ${id}`);
    if (existing.status !== "pending") throw new Error(`Edge is not pending (status: ${existing.status})`);

    const row = await updateEdgeRow(id, { status: "rejected" });
    if (!row) throw new Error(`Edge not found: ${id}`);
    return rowToEdge(row);
};

// Called from server/routes/lorebook.ts's DELETE /:id — the delete-cascade for edges, since no
// real FK covers fromId/toId.
export const deleteEdgesForEntity = async (entryId: string): Promise<number> => deleteEdgesForEntityRow(entryId);

// ── Graph assembly ────────────────────────────────────────────────────────────

const hasLegacyRelationships = (entries: LorebookRow[]): boolean =>
    entries.some(e => (readMetadata(e)?.relationships?.length ?? 0) > 0);

export const getStoryGraph = async (storyId: string): Promise<StoryGraphResponse> => {
    const [visibleEntries, edges] = await Promise.all([listVisibleEntriesForStory(storyId), listActiveEdgesForStory(storyId)]);

    const storyEntries = visibleEntries.filter(e => e.level === "story" && e.scopeId === storyId);
    // Node set = story-scoped entries UNION anything actually referenced by an edge (covers a
    // linked-in series/global entry) — no separate "include series/global" toggle.
    const nodeIds = new Set(storyEntries.map(e => e.id));
    for (const edge of edges) {
        nodeIds.add(edge.fromId);
        nodeIds.add(edge.toId);
    }
    const entryById = new Map(visibleEntries.map(e => [e.id, e]));
    const nodes = [...nodeIds].map(id => entryById.get(id)).filter((e): e is LorebookRow => !!e).map(rowToNode);

    return {
        nodes,
        edges: edges.map(rowToEdge),
        hasLegacyRelationships: hasLegacyRelationships(storyEntries)
    };
};

// In-memory BFS over the story's active edges — not a recursive SQL CTE, justified by the design
// doc's own ~200 node/~500 edge comfort target for a personal novel's lorebook.
export const getNeighborhood = async (storyId: string, entryId: string, depth: 1 | 2): Promise<StoryGraphResponse> => {
    const [visibleEntries, allEdges] = await Promise.all([listVisibleEntriesForStory(storyId), listActiveEdgesForStory(storyId)]);
    const entryById = new Map(visibleEntries.map(e => [e.id, e]));

    const visitedNodeIds = new Set<string>([entryId]);
    const includedEdgeIds = new Set<string>();
    let frontier = new Set<string>([entryId]);

    for (let hop = 0; hop < depth; hop++) {
        const nextFrontier = new Set<string>();
        for (const edge of allEdges) {
            const touchesFrontier = frontier.has(edge.fromId) || frontier.has(edge.toId);
            if (!touchesFrontier) continue;
            includedEdgeIds.add(edge.id);
            const other = frontier.has(edge.fromId) ? edge.toId : edge.fromId;
            if (!visitedNodeIds.has(other)) nextFrontier.add(other);
            visitedNodeIds.add(other);
        }
        frontier = nextFrontier;
        if (frontier.size === 0) break;
    }

    const nodes = [...visitedNodeIds].map(id => entryById.get(id)).filter((e): e is LorebookRow => !!e).map(rowToNode);
    const edges = allEdges.filter(e => includedEdgeIds.has(e.id)).map(rowToEdge);

    const storyEntries = visibleEntries.filter(e => e.level === "story" && e.scopeId === storyId);
    return { nodes, edges, hasLegacyRelationships: hasLegacyRelationships(storyEntries) };
};

// ── Migration from metadata.relationships ─────────────────────────────────────

const TYPE_NORMALIZATION: Record<string, StoryGraphEdgeType> = {
    friend: "knows",
    friends: "knows",
    acquaintance: "knows",
    knows: "knows",
    ally: "allied_with",
    allied: "allied_with",
    allied_with: "allied_with",
    partner: "allied_with",
    enemy: "opposed_to",
    rival: "opposed_to",
    opposed: "opposed_to",
    opposed_to: "opposed_to",
    antagonist: "opposed_to",
    member: "member_of",
    member_of: "member_of",
    belongs_to: "member_of",
    location: "located_in",
    located_in: "located_in",
    lives_in: "located_in",
    based_in: "located_in",
    owns: "owns",
    owner: "owns",
    possesses: "owns",
    holds: "holds",
    holder: "holds",
    carries: "holds",
    employer: "works_at",
    works_at: "works_at",
    employee: "works_at",
    works_for: "works_at",
    family: "related_to",
    relative: "related_to",
    sibling: "related_to",
    parent: "related_to",
    child: "related_to",
    spouse: "related_to",
    related: "related_to",
    related_to: "related_to",
    part_of: "part_of",
    component: "part_of",
    subsection: "part_of",
    caused: "caused",
    causes: "caused",
    caused_by: "caused",
    involved_in: "involved_in",
    participant: "involved_in",
    involved: "involved_in",
    mentions: "mentions",
    references: "mentions",
    mentioned: "mentions",
    contradicts: "contradicts",
    conflicts_with: "contradicts"
};

const normalizeEdgeType = (raw: string): { edgeType: StoryGraphEdgeType; description: string | undefined } => {
    const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
    const mapped = TYPE_NORMALIZATION[key];
    if (mapped) return { edgeType: mapped, description: undefined };
    // Unmapped — never silently drop the original type string, preserve it in the description.
    return { edgeType: "other", description: `[${raw}]` };
};

// Idempotent — safe to re-run. Reads metadata.relationships (never written to after this),
// resolves targetId against ALL entries visible to this story (not just story-scoped — a
// relationship can legitimately point at a global/series entry), skips silently on an
// unresolvable target or a self-reference, dedups against already-migrated (or otherwise
// already-existing) active edges.
export const migrateStoryRelationships = async (storyId: string): Promise<StoryGraphMigrationResult> => {
    const visibleEntries = await listVisibleEntriesForStory(storyId);
    const visibleById = new Map(visibleEntries.map(e => [e.id, e]));
    const storyEntries = visibleEntries.filter(e => e.level === "story" && e.scopeId === storyId);

    const existingEdges = await listActiveEdgesForStory(storyId);
    const existingKeys = new Set(existingEdges.map(e => `${e.fromId}|${e.toId}|${e.edgeType}`));

    let migrated = 0;
    let skipped = 0;
    const skippedDetails: StoryGraphMigrationResult["skippedDetails"] = [];

    for (const entry of storyEntries) {
        const relationships = readMetadata(entry)?.relationships ?? [];
        for (const rel of relationships) {
            if (!visibleById.has(rel.targetId)) {
                skipped++;
                skippedDetails.push({ entryId: entry.id, targetId: rel.targetId, reason: "target not found" });
                continue;
            }
            if (rel.targetId === entry.id) {
                skipped++;
                skippedDetails.push({ entryId: entry.id, targetId: rel.targetId, reason: "self-reference" });
                continue;
            }

            const { edgeType, description: normalizationPrefix } = normalizeEdgeType(rel.type);
            const key = `${entry.id}|${rel.targetId}|${edgeType}`;
            if (existingKeys.has(key)) {
                skipped++;
                skippedDetails.push({ entryId: entry.id, targetId: rel.targetId, reason: "duplicate" });
                continue;
            }

            const description = [normalizationPrefix, rel.description].filter(Boolean).join(" ") || null;
            await insertEdge({
                storyId,
                fromId: entry.id,
                toId: rel.targetId,
                edgeType,
                label: null,
                description,
                status: "active",
                source: "migrated"
            });
            existingKeys.add(key);
            migrated++;
        }
    }

    return { migrated, skipped, skippedDetails };
};
