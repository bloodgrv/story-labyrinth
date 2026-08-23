import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";

// Custom drag order (T13, docs/Lorebook_Custom_Order_Design.md) — cosmetic author-pinned browse
// rank only. Peers = same level+scopeId+category+folderId bucket (folderId null = Unfiled).

type LorebookRow = typeof schema.lorebookEntries.$inferSelect;

export type OrderBucket = { level: string; scopeId: string | null; category: string; folderId: string | null };

export const bucketOf = (entry: Pick<LorebookRow, "level" | "scopeId" | "category" | "folderId">): OrderBucket => ({
    level: entry.level,
    scopeId: entry.scopeId,
    category: entry.category,
    folderId: entry.folderId
});

const bucketConditions = (bucket: OrderBucket) =>
    and(
        eq(schema.lorebookEntries.level, bucket.level),
        bucket.scopeId === null ? isNull(schema.lorebookEntries.scopeId) : eq(schema.lorebookEntries.scopeId, bucket.scopeId),
        eq(schema.lorebookEntries.category, bucket.category),
        bucket.folderId === null ? isNull(schema.lorebookEntries.folderId) : eq(schema.lorebookEntries.folderId, bucket.folderId)
    );

// Append target for a newly created entry, or one just filed/re-categorized into `bucket` — never
// densifies the bucket it left, per the design's "no eager source densify" call (Axis 3).
export const nextManualOrder = async (bucket: OrderBucket): Promise<number> => {
    const [row] = await db
        .select({ max: sql<number | null>`max(${schema.lorebookEntries.manualOrder})` })
        .from(schema.lorebookEntries)
        .where(bucketConditions(bucket));
    return (row?.max ?? 0) + 1;
};

// PATCH /api/lorebook/reorder — full desired order for one bucket, rewritten to dense 1..N.
export const reorderLorebookEntries = async (orderedIds: string[]): Promise<LorebookRow[]> => {
    if (orderedIds.length === 0) throw new Error("orderedIds must not be empty");

    const rows = await db.select().from(schema.lorebookEntries).where(inArray(schema.lorebookEntries.id, orderedIds));
    if (rows.length !== orderedIds.length) throw new Error("One or more entries were not found");

    const rowsById = new Map(rows.map(row => [row.id, row]));
    const bucket = bucketOf(rows[0]);
    const mismatched = rows.some(row => {
        const rowBucket = bucketOf(row);
        return (
            rowBucket.level !== bucket.level ||
            rowBucket.scopeId !== bucket.scopeId ||
            rowBucket.category !== bucket.category ||
            rowBucket.folderId !== bucket.folderId
        );
    });
    if (mismatched) throw new Error("All entries must share the same level, scope, category, and folder");

    const now = new Date();
    db.transaction(tx => {
        orderedIds.forEach((id, index) => {
            tx.update(schema.lorebookEntries)
                .set({ manualOrder: index + 1, updatedAt: now })
                .where(eq(schema.lorebookEntries.id, id))
                .run();
        });
    });

    return orderedIds.map(id => ({ ...rowsById.get(id)!, manualOrder: orderedIds.indexOf(id) + 1, updatedAt: now }));
};
