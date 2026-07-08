import { and, eq } from "drizzle-orm";
import type { CharacterArcEntry, OutlineItem } from "../../src/types/outline.js";
import { db, schema } from "../db/client.js";

type OutlineItemRow = typeof schema.outlineItems.$inferSelect;

const toOutlineItem = (row: OutlineItemRow): OutlineItem => ({
    ...row,
    type: row.type as OutlineItem["type"],
    source: row.source as OutlineItem["source"],
    status: row.status as OutlineItem["status"]
});

// Flattens the two-level outline into story reading order: "chapter" rows sorted by their own
// `order`, each immediately followed by its "scene" children sorted by theirs. This ordering IS
// what makes a character's linked items into a coherent "arc" rather than an arbitrary set.
const flattenInReadingOrder = (items: OutlineItem[]): OutlineItem[] => {
    const chapters = items.filter(item => item.type === "chapter").sort((a, b) => a.order - b.order);

    const scenesByParent = new Map<string, OutlineItem[]>();
    for (const item of items) {
        if (item.type !== "scene" || !item.parentId) continue;
        const siblings = scenesByParent.get(item.parentId) ?? [];
        siblings.push(item);
        scenesByParent.set(item.parentId, siblings);
    }
    for (const siblings of scenesByParent.values()) siblings.sort((a, b) => a.order - b.order);

    return chapters.flatMap(chapter => [chapter, ...(scenesByParent.get(chapter.id) ?? [])]);
};

// A character's "arc overview": every outline item they're linked to, in story order, with the
// per-link development note. Excludes rejected (dismissed AI suggestion) items — those are
// effectively deleted content, not part of the story's structure.
export const getCharacterArc = async (storyId: string, characterId: string): Promise<CharacterArcEntry[]> => {
    const [itemRows, linkRows] = await Promise.all([
        db.select().from(schema.outlineItems).where(eq(schema.outlineItems.storyId, storyId)),
        db
            .select()
            .from(schema.outlineItemCharacters)
            .where(
                and(
                    eq(schema.outlineItemCharacters.storyId, storyId),
                    eq(schema.outlineItemCharacters.characterId, characterId)
                )
            )
    ]);

    const items = itemRows.map(toOutlineItem).filter(item => item.status !== "rejected");
    const linkByItemId = new Map(linkRows.map(link => [link.outlineItemId, link]));

    return flattenInReadingOrder(items)
        .filter(item => linkByItemId.has(item.id))
        .map(outlineItem => {
            const link = linkByItemId.get(outlineItem.id);
            if (!link) throw new Error("unreachable: filtered above");
            return { outlineItem, link };
        });
};
