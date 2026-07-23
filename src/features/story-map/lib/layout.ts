import type { StoryMapNode } from "@/types/storyMap";

export type NodePosition = { x: number; y: number };

// Plain grid, positions assigned in input order — same fallback layoutGrid uses in
// story-graph/lib/layout.ts. Kept as its own tiny copy rather than importing that one directly to
// avoid coupling two otherwise independent features over a ~10-line function.
//
// L5a — ordering is the CALLER's responsibility (not sorted internally here as it originally
// was), since StoryMapCanvas.tsx needs floor-aware ordering within a focused region and plain
// alphabetical everywhere else — see sortNodesForDisplay in StoryMapCanvas.tsx.
export const layoutGrid = (nodes: StoryMapNode[]): Map<string, NodePosition> => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const positions = new Map<string, NodePosition>();
    nodes.forEach((n, i) => {
        positions.set(n.id, { x: (i % cols) * 180, y: Math.floor(i / cols) * 180 });
    });
    return positions;
};
