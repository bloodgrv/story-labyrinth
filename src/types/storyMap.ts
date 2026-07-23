// Story Map domain types — L3, docs/Locations_And_Maps_Design.md. Nodes are location-category
// lorebook entries; edges are typed, directed spatial links stored in storyMapEdges. Mirrors
// src/types/storyGraph.ts's shape, deliberately a separate type/table from the Relationship
// Graph — see storyMapEdges' own schema.ts comment for why.

export type StoryMapEdgeType = "contains" | "borders" | "road_to" | "portal_to" | "below" | "above" | "other";

export const STORY_MAP_EDGE_TYPES: StoryMapEdgeType[] = ["contains", "borders", "road_to", "portal_to", "below", "above", "other"];

export const STORY_MAP_EDGE_TYPE_LABELS: Record<StoryMapEdgeType, string> = {
    contains: "Contains",
    borders: "Borders",
    road_to: "Road To",
    portal_to: "Portal To",
    below: "Below",
    above: "Above",
    other: "Other"
};

export interface StoryMapNode {
    id: string;
    name: string;
    level: "global" | "series" | "story";
    isDisabled: boolean;
    imageFilename: string | null;
    scale: string | null;
}

export interface StoryMapEdge {
    id: string;
    storyId: string;
    fromId: string;
    toId: string;
    edgeType: StoryMapEdgeType;
    label: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date | null;
}

export interface StoryMapResponse {
    nodes: StoryMapNode[];
    edges: StoryMapEdge[];
}

export interface StoryMapLayoutPosition {
    nodeId: string;
    x: number;
    y: number;
}
