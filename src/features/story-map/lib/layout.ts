import type { StoryMapNode } from "@/types/storyMap";

export type NodePosition = { x: number; y: number };

// Plain grid, alphabetical — same fallback layoutGrid uses in story-graph/lib/layout.ts. Kept as
// its own tiny copy rather than importing that one directly to avoid coupling two otherwise
// independent features over a ~10-line function.
export const layoutGrid = (nodes: StoryMapNode[]): Map<string, NodePosition> => {
    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const positions = new Map<string, NodePosition>();
    sorted.forEach((n, i) => {
        positions.set(n.id, { x: (i % cols) * 180, y: Math.floor(i / cols) * 180 });
    });
    return positions;
};
