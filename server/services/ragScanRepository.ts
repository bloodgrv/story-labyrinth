import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type {
    RagIssueStatus,
    RagScan,
    RagScanEvidence,
    RagScanIssue,
    RagScanScope,
    RagScanStatus
} from "../../src/types/ragScan.js";

// ── Row → domain mapping ─────────────────────────────────────────────────────────

const rowToScan = (row: typeof schema.ragScans.$inferSelect): RagScan => ({
    id: row.id,
    storyId: row.storyId,
    scope: row.scope as RagScanScope,
    chapterId: row.chapterId ?? null,
    status: row.status as RagScanStatus,
    totalChapters: row.totalChapters,
    processedChapters: row.processedChapters,
    model: row.model ?? null,
    error: row.error ?? null,
    failedChapterIds: (row.failedChapterIds as string[] | null) ?? [],
    createdAt: row.createdAt as unknown as Date,
    startedAt: (row.startedAt as unknown as Date | null) ?? null,
    completedAt: (row.completedAt as unknown as Date | null) ?? null
});

const rowToIssue = (row: typeof schema.ragScanIssues.$inferSelect): RagScanIssue => ({
    id: row.id,
    scanId: row.scanId,
    storyId: row.storyId,
    chapterId: row.chapterId,
    issueType: row.issueType as RagScanIssue["issueType"],
    severity: row.severity as RagScanIssue["severity"],
    description: row.description,
    evidence: (row.evidence as RagScanEvidence[] | null) ?? [],
    suggestedFix: row.suggestedFix ?? null,
    relatedEntityId: row.relatedEntityId ?? null,
    status: row.status as RagIssueStatus,
    createdAt: row.createdAt as unknown as Date
});

// ── Scans ──────────────────────────────────────────────────────────────────────

export const createScan = async (params: {
    storyId: string;
    scope: RagScanScope;
    chapterId: string | null;
    totalChapters: number;
}): Promise<RagScan> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.ragScans)
        .values({
            id: crypto.randomUUID(),
            storyId: params.storyId,
            scope: params.scope,
            chapterId: params.chapterId,
            status: "running",
            totalChapters: params.totalChapters,
            processedChapters: 0,
            model: null,
            error: null,
            createdAt: now,
            startedAt: now,
            completedAt: null
        })
        .returning();
    return rowToScan(row);
};

export const updateScanProgress = async (scanId: string, processedChapters: number): Promise<void> => {
    await db.update(schema.ragScans).set({ processedChapters }).where(eq(schema.ragScans.id, scanId));
};

// B30 — `failedChapterIds` (default []) flips status to 'completed_with_errors' instead of the
// plain 'completed' every caller got before, regardless of how many chapters actually failed.
export const completeScan = async (
    scanId: string,
    fields: { model: string | null; processedChapters: number; failedChapterIds?: string[] }
): Promise<RagScan> => {
    const failedChapterIds = fields.failedChapterIds ?? [];
    const [row] = await db
        .update(schema.ragScans)
        .set({
            status: failedChapterIds.length > 0 ? "completed_with_errors" : "completed",
            model: fields.model,
            processedChapters: fields.processedChapters,
            failedChapterIds: failedChapterIds.length > 0 ? failedChapterIds : null,
            completedAt: new Date()
        })
        .where(eq(schema.ragScans.id, scanId))
        .returning();
    return rowToScan(row);
};

export const failScan = async (scanId: string, error: string): Promise<RagScan> => {
    const [row] = await db
        .update(schema.ragScans)
        .set({ status: "failed", error, completedAt: new Date() })
        .where(eq(schema.ragScans.id, scanId))
        .returning();
    return rowToScan(row);
};

export const getScan = async (scanId: string): Promise<RagScan | null> => {
    const [row] = await db.select().from(schema.ragScans).where(eq(schema.ragScans.id, scanId));
    return row ? rowToScan(row) : null;
};

export const getScansForStory = async (storyId: string): Promise<RagScan[]> => {
    const rows = await db
        .select()
        .from(schema.ragScans)
        .where(eq(schema.ragScans.storyId, storyId))
        .orderBy(desc(schema.ragScans.createdAt));
    return rows.map(rowToScan);
};

// ── Issues ─────────────────────────────────────────────────────────────────────

export type NewIssueParams = {
    scanId: string;
    storyId: string;
    chapterId: string;
    issueType: RagScanIssue["issueType"];
    severity: RagScanIssue["severity"];
    description: string;
    evidence: RagScanEvidence[];
    suggestedFix: string | null;
    relatedEntityId: string | null;
};

export const createIssues = async (items: NewIssueParams[]): Promise<RagScanIssue[]> => {
    if (items.length === 0) return [];

    const now = new Date();
    const values = items.map(item => ({
        id: crypto.randomUUID(),
        scanId: item.scanId,
        storyId: item.storyId,
        chapterId: item.chapterId,
        issueType: item.issueType,
        severity: item.severity,
        description: item.description,
        evidence: item.evidence,
        suggestedFix: item.suggestedFix,
        relatedEntityId: item.relatedEntityId,
        status: "open" as const,
        createdAt: now
    }));

    const rows = await db.insert(schema.ragScanIssues).values(values).returning();
    return rows.map(rowToIssue);
};

export const getIssuesForScan = async (scanId: string): Promise<RagScanIssue[]> => {
    const rows = await db
        .select()
        .from(schema.ragScanIssues)
        .where(eq(schema.ragScanIssues.scanId, scanId))
        .orderBy(desc(schema.ragScanIssues.createdAt));
    return rows.map(rowToIssue);
};

export const getIssuesForStory = async (storyId: string, status?: RagIssueStatus): Promise<RagScanIssue[]> => {
    const conditions = [eq(schema.ragScanIssues.storyId, storyId)];
    if (status) conditions.push(eq(schema.ragScanIssues.status, status));

    const rows = await db
        .select()
        .from(schema.ragScanIssues)
        .where(and(...conditions))
        .orderBy(desc(schema.ragScanIssues.createdAt));
    return rows.map(rowToIssue);
};

export const updateIssueStatus = async (issueId: string, status: RagIssueStatus): Promise<RagScanIssue | null> => {
    const [row] = await db
        .update(schema.ragScanIssues)
        .set({ status })
        .where(eq(schema.ragScanIssues.id, issueId))
        .returning();
    return row ? rowToIssue(row) : null;
};
