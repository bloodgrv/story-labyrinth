// Story Graph domain types — the "thin story graph" (docs/Thin_Story_Graph_And_Lorebook_Visualization.md).
// Nodes are lorebook entries; edges are typed, directed links stored in storyGraphEdges.

export type StoryGraphEdgeType =
    | "knows"
    | "allied_with"
    | "opposed_to"
    | "member_of"
    | "located_in"
    | "owns"
    | "holds"
    | "works_at"
    | "related_to"
    | "part_of"
    | "caused"
    | "involved_in"
    | "mentions"
    | "contradicts"
    | "other";

// Concrete/factual types only — deliberately no psychological, power-dynamic, or corruption
// types (design doc §4.3's explicit non-goal).
export const STORY_GRAPH_EDGE_TYPES: StoryGraphEdgeType[] = [
    "knows",
    "allied_with",
    "opposed_to",
    "member_of",
    "located_in",
    "owns",
    "holds",
    "works_at",
    "related_to",
    "part_of",
    "caused",
    "involved_in",
    "mentions",
    "contradicts",
    "other"
];

export const STORY_GRAPH_EDGE_TYPE_LABELS: Record<StoryGraphEdgeType, string> = {
    knows: "Knows",
    allied_with: "Allied With",
    opposed_to: "Opposed To",
    member_of: "Member Of",
    located_in: "Located In",
    owns: "Owns",
    holds: "Holds",
    works_at: "Works At",
    related_to: "Related To",
    part_of: "Part Of",
    caused: "Caused",
    involved_in: "Involved In",
    mentions: "Mentions",
    contradicts: "Contradicts",
    other: "Other"
};

// 'pending' is produced by the manual "Propose for review" toggle on edge create, and reviewed
// via the Pending tab's approve/reject actions. AI-suggested edges (a separate, larger effort)
// would write into this same 'pending' lane later — no further type-level rework needed.
export type StoryGraphStatus = "active" | "pending" | "rejected";
export type StoryGraphEdgeSource = "user" | "import" | "ai_suggested" | "migrated";

export interface StoryGraphNode {
    id: string;
    name: string;
    category: string;
    level: "global" | "series" | "story";
    isDisabled: boolean;
    imageFilename: string | null;
    importance: "major" | "minor" | "background" | null;
}

export interface StoryGraphEdge {
    id: string;
    storyId: string;
    fromId: string;
    toId: string;
    edgeType: StoryGraphEdgeType;
    label: string | null;
    description: string | null;
    status: StoryGraphStatus;
    asOfChapterId: string | null;
    source: StoryGraphEdgeSource;
    createdAt: Date;
    updatedAt: Date | null;
}

export interface StoryGraphResponse {
    nodes: StoryGraphNode[];
    edges: StoryGraphEdge[];
    hasLegacyRelationships: boolean;
}

export interface StoryGraphMigrationResult {
    migrated: number;
    skipped: number;
    skippedDetails: Array<{ entryId: string; targetId: string; reason: string }>;
}

// A pending edge with its endpoint names resolved server-side (names aren't otherwise guaranteed
// resolvable client-side — see storyGraphService.ts's listPendingEdges comment).
export interface StoryGraphPendingEdge {
    edge: StoryGraphEdge;
    fromName: string;
    toName: string;
}

// Persisted node position for the Full-graph canvas (P1.2 G1.5+). nodeId is a lorebook entry id.
export interface StoryGraphLayoutPosition {
    nodeId: string;
    x: number;
    y: number;
}
