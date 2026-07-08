import type { OutlineItem } from "@/types/outline";

export interface GroupedOutline {
    chapters: OutlineItem[];
    scenesByChapter: Map<string, OutlineItem[]>;
    pendingCount: number;
}

// Groups the flat OutlineItem[] a story query returns into the two-level shape the tree
// actually renders: top-level chapters (sorted), each with its own sorted scene list. Rejected
// (dismissed AI suggestion) rows are dropped entirely — they're kept in the database as an
// audit trail (see routes/outline.ts) but never rendered. Pure/computed once per query result
// via useMemo at the call site, not recomputed per row, so this stays cheap even for a large
// outline.
export function groupOutlineItems(items: OutlineItem[]): GroupedOutline {
    const visible = items.filter(item => item.status !== "rejected");
    const chapters = visible.filter(item => item.type === "chapter").sort((a, b) => a.order - b.order);

    const scenesByChapter = new Map<string, OutlineItem[]>();
    for (const item of visible) {
        if (item.type !== "scene" || !item.parentId) continue;
        const siblings = scenesByChapter.get(item.parentId) ?? [];
        siblings.push(item);
        scenesByChapter.set(item.parentId, siblings);
    }
    for (const siblings of scenesByChapter.values()) siblings.sort((a, b) => a.order - b.order);

    const pendingCount = visible.filter(item => item.status === "pending").length;

    return { chapters, scenesByChapter, pendingCount };
}
