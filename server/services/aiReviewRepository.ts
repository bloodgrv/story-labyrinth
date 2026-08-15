import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type {
    AiReview,
    AiReviewFinding,
    AiReviewFindingStatus,
    AiReviewMode,
    AiReviewOptions,
    AiReviewSeverity,
    AiReviewStatus,
    AiReviewTag
} from "../../src/types/aiReview.js";

// ── Row → domain mapping ─────────────────────────────────────────────────────────

const rowToReview = (row: typeof schema.aiReviews.$inferSelect): AiReview => ({
    id: row.id,
    storyId: row.storyId,
    mode: row.mode as AiReviewMode,
    chapterIds: (row.chapterIds as string[] | null) ?? [],
    status: row.status as AiReviewStatus,
    options: (row.options as AiReviewOptions | null) ?? null,
    model: row.model ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt as unknown as Date,
    completedAt: (row.completedAt as unknown as Date | null) ?? null
});

const rowToFinding = (row: typeof schema.aiReviewFindings.$inferSelect): AiReviewFinding => ({
    id: row.id,
    reviewId: row.reviewId,
    storyId: row.storyId,
    chapterId: row.chapterId ?? null,
    tag: row.tag as AiReviewTag,
    severity: row.severity as AiReviewSeverity,
    title: row.title,
    description: row.description,
    excerpt: row.excerpt ?? null,
    excerptStart: row.excerptStart ?? null,
    excerptEnd: row.excerptEnd ?? null,
    direction: row.direction ?? null,
    status: row.status as AiReviewFindingStatus,
    createdAt: row.createdAt as unknown as Date
});

// ── Reviews ────────────────────────────────────────────────────────────────────

export const createReview = async (params: {
    storyId: string;
    mode: AiReviewMode;
    chapterIds: string[];
    options?: AiReviewOptions | null;
}): Promise<AiReview> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.aiReviews)
        .values({
            id: crypto.randomUUID(),
            storyId: params.storyId,
            mode: params.mode,
            chapterIds: params.chapterIds,
            status: "running",
            options: params.options ?? null,
            model: null,
            error: null,
            createdAt: now,
            completedAt: null
        })
        .returning();
    return rowToReview(row);
};

export const completeReview = async (reviewId: string, fields: { model: string | null }): Promise<AiReview> => {
    const [row] = await db
        .update(schema.aiReviews)
        .set({ status: "completed", model: fields.model, completedAt: new Date() })
        .where(eq(schema.aiReviews.id, reviewId))
        .returning();
    return rowToReview(row);
};

export const failReview = async (reviewId: string, error: string): Promise<AiReview> => {
    const [row] = await db
        .update(schema.aiReviews)
        .set({ status: "failed", error, completedAt: new Date() })
        .where(eq(schema.aiReviews.id, reviewId))
        .returning();
    return rowToReview(row);
};

// AR5 — writes back the auto-detected cast entry ids once resolved (the review row is created
// before that resolution happens, so this is a follow-up update, not part of createReview).
export const updateReviewOptions = async (reviewId: string, options: AiReviewOptions): Promise<void> => {
    await db.update(schema.aiReviews).set({ options }).where(eq(schema.aiReviews.id, reviewId));
};

export const getReview = async (reviewId: string): Promise<AiReview | null> => {
    const [row] = await db.select().from(schema.aiReviews).where(eq(schema.aiReviews.id, reviewId));
    return row ? rowToReview(row) : null;
};

// ── Findings ───────────────────────────────────────────────────────────────────

export type NewFindingParams = {
    reviewId: string;
    storyId: string;
    chapterId: string | null;
    tag: AiReviewTag;
    severity: AiReviewSeverity;
    title: string;
    description: string;
    excerpt: string | null;
    excerptStart: number | null;
    excerptEnd: number | null;
    direction: string | null;
};

export const createFindings = async (items: NewFindingParams[]): Promise<AiReviewFinding[]> => {
    if (items.length === 0) return [];

    const now = new Date();
    const values = items.map(item => ({
        id: crypto.randomUUID(),
        reviewId: item.reviewId,
        storyId: item.storyId,
        chapterId: item.chapterId,
        tag: item.tag,
        severity: item.severity,
        title: item.title,
        description: item.description,
        excerpt: item.excerpt,
        excerptStart: item.excerptStart,
        excerptEnd: item.excerptEnd,
        direction: item.direction,
        status: "open" as const,
        createdAt: now
    }));

    const rows = await db.insert(schema.aiReviewFindings).values(values).returning();
    return rows.map(rowToFinding);
};

export const getFindingsForReview = async (reviewId: string): Promise<AiReviewFinding[]> => {
    const rows = await db
        .select()
        .from(schema.aiReviewFindings)
        .where(eq(schema.aiReviewFindings.reviewId, reviewId))
        .orderBy(desc(schema.aiReviewFindings.createdAt));
    return rows.map(rowToFinding);
};

export const getFindingsForStory = async (
    storyId: string,
    filters?: { status?: AiReviewFindingStatus; tag?: AiReviewTag; chapterId?: string }
): Promise<AiReviewFinding[]> => {
    const conditions = [eq(schema.aiReviewFindings.storyId, storyId)];
    if (filters?.status) conditions.push(eq(schema.aiReviewFindings.status, filters.status));
    if (filters?.tag) conditions.push(eq(schema.aiReviewFindings.tag, filters.tag));
    if (filters?.chapterId) conditions.push(eq(schema.aiReviewFindings.chapterId, filters.chapterId));

    const rows = await db
        .select()
        .from(schema.aiReviewFindings)
        .where(and(...conditions))
        .orderBy(desc(schema.aiReviewFindings.createdAt));
    return rows.map(rowToFinding);
};

export const updateFindingStatus = async (
    findingId: string,
    status: AiReviewFindingStatus
): Promise<AiReviewFinding | null> => {
    const [row] = await db
        .update(schema.aiReviewFindings)
        .set({ status })
        .where(eq(schema.aiReviewFindings.id, findingId))
        .returning();
    return row ? rowToFinding(row) : null;
};
