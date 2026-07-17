import type { StoryGraphEdge, StoryGraphNode } from "@/types/storyGraph";

export type NodePosition = { x: number; y: number };

// Deterministic, recomputed every load — position persistence is explicitly out of scope for
// this pass (design doc's storyGraphLayout table, "Slice 5", not built).

// Ego mode: concentric rings by BFS hop distance from centerId, undirected (relationship
// direction doesn't matter for layout purposes, only for the edge's own arrow/label).
export const layoutEgo = (nodes: StoryGraphNode[], edges: StoryGraphEdge[], centerId: string): Map<string, NodePosition> => {
    const adjacency = new Map<string, Set<string>>();
    for (const e of edges) {
        if (!adjacency.has(e.fromId)) adjacency.set(e.fromId, new Set());
        if (!adjacency.has(e.toId)) adjacency.set(e.toId, new Set());
        adjacency.get(e.fromId)?.add(e.toId);
        adjacency.get(e.toId)?.add(e.fromId);
    }

    const hopById = new Map<string, number>([[centerId, 0]]);
    let frontier = [centerId];
    let hop = 0;
    while (frontier.length > 0) {
        hop++;
        const next: string[] = [];
        for (const id of frontier)
            for (const neighbor of adjacency.get(id) ?? []) {
                if (hopById.has(neighbor)) continue;
                hopById.set(neighbor, hop);
                next.push(neighbor);
            }
        frontier = next;
    }

    const unreachableHop = hop + 1;
    const byHop = new Map<number, string[]>();
    for (const n of nodes) {
        const d = hopById.get(n.id) ?? unreachableHop;
        if (!byHop.has(d)) byHop.set(d, []);
        byHop.get(d)?.push(n.id);
    }

    const positions = new Map<string, NodePosition>();
    for (const [d, ids] of byHop) {
        if (d === 0) {
            positions.set(ids[0], { x: 0, y: 0 });
            continue;
        }
        const radius = d * 200;
        ids.forEach((id, i) => {
            const angle = (2 * Math.PI * i) / ids.length;
            positions.set(id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
        });
    }
    return positions;
};

// Full-graph mode: plain grid, alphabetical (matches the ego-view default's own alphabetical
// convention) so the layout is at least stable and predictable across reloads.
export const layoutGrid = (nodes: StoryGraphNode[]): Map<string, NodePosition> => {
    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const positions = new Map<string, NodePosition>();
    sorted.forEach((n, i) => {
        positions.set(n.id, { x: (i % cols) * 180, y: Math.floor(i / cols) * 180 });
    });
    return positions;
};
