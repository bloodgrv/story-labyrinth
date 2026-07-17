import { and, desc, eq, like } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type {
    CodexPendingChange,
    CodexPendingSourceType,
    CodexPendingStatus,
    CodexSnapshot,
    CodexSourceType,
    CodexState
} from "../../src/types/codex.js";

// ── Input types ────────────────────────────────────────────────────────────────

export type CreateSnapshotParams = {
    entryId: string;
    description: string;
    codexState: CodexState | null;
    sourceType: CodexSourceType;
    sourceRef?: string | null;
};

export type CreatePendingChangeParams = {
    entryId: string;
    proposedDescription?: string | null;
    proposedState?: CodexState | null;
    proposedTags?: string[] | null;
    proposedNeedsFleshingOut?: boolean | null;
    sourceType: CodexPendingSourceType;
    sourceRef?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const rowToSnapshot = (row: typeof schema.codexSnapshots.$inferSelect): CodexSnapshot => ({
    id: row.id,
    entryId: row.entryId,
    description: row.description,
    codexState: (row.codexState as CodexState | null) ?? null,
    sourceType: row.sourceType as CodexSourceType,
    sourceRef: row.sourceRef ?? null,
    label: row.label ?? null,
    createdAt: row.createdAt as unknown as Date
});

const rowToPendingChange = (row: typeof schema.codexPendingChanges.$inferSelect): CodexPendingChange => ({
    id: row.id,
    entryId: row.entryId,
    proposedDescription: row.proposedDescription ?? null,
    proposedState: (row.proposedState as CodexState | null) ?? null,
    proposedTags: (row.proposedTags as string[] | null) ?? null,
    proposedNeedsFleshingOut: row.proposedNeedsFleshingOut ?? null,
    sourceType: row.sourceType as CodexPendingSourceType,
    sourceRef: row.sourceRef ?? null,
    status: row.status as CodexPendingStatus,
    createdAt: row.createdAt as unknown as Date,
    resolvedAt: (row.resolvedAt as unknown as Date | null) ?? null
});

// ── Insert / Update ────────────────────────────────────────────────────────────

export type NewCodexEntryValues = {
    level: string;
    scopeId?: string | null;
    name: string;
    description: string;
    category: string;
    tags: string[];
    needsFleshingOut?: boolean | null;
};

export const insertCodexEntry = async (values: NewCodexEntryValues) => {
    const [row] = await db
        .insert(schema.lorebookEntries)
        .values({
            id: crypto.randomUUID(),
            level: values.level,
            scopeId: values.scopeId ?? null,
            name: values.name,
            description: values.description,
            category: values.category,
            tags: values.tags,
            codexEnabled: true,
            needsFleshingOut: values.needsFleshingOut ?? null,
            codexState: null,
            createdAt: new Date(),
            updatedAt: new Date()
        })
        .returning();
    return row;
};

export type UpdateCodexEntryFields = Partial<{
    description: string;
    codexState: CodexState | null;
    tags: string[];
    needsFleshingOut: boolean | null;
    codexEnabled: boolean | null;
    updatedAt: Date;
}>;

export const updateCodexEntryFields = async (
    id: string,
    fields: UpdateCodexEntryFields
): Promise<typeof schema.lorebookEntries.$inferSelect | null> => {
    const updates: Partial<typeof schema.lorebookEntries.$inferInsert> = {
        updatedAt: fields.updatedAt ?? new Date()
    };
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.codexState !== undefined) updates.codexState = fields.codexState;
    if (fields.tags !== undefined) updates.tags = fields.tags;
    if (fields.needsFleshingOut !== undefined) updates.needsFleshingOut = fields.needsFleshingOut;
    if (fields.codexEnabled !== undefined) updates.codexEnabled = fields.codexEnabled;

    const [row] = await db
        .update(schema.lorebookEntries)
        .set(updates)
        .where(eq(schema.lorebookEntries.id, id))
        .returning();
    return row ?? null;
};

// ── Queries ────────────────────────────────────────────────────────────────────

export const getCodexEntry = async (id: string) => {
    const [entry] = await db
        .select()
        .from(schema.lorebookEntries)
        .where(eq(schema.lorebookEntries.id, id));
    return entry ?? null;
};

export const getSnapshotsForEntry = async (entryId: string): Promise<CodexSnapshot[]> => {
    const rows = await db
        .select()
        .from(schema.codexSnapshots)
        .where(eq(schema.codexSnapshots.entryId, entryId))
        .orderBy(desc(schema.codexSnapshots.createdAt));
    return rows.map(rowToSnapshot);
};

export const getSnapshotById = async (snapshotId: string): Promise<CodexSnapshot | null> => {
    const [row] = await db.select().from(schema.codexSnapshots).where(eq(schema.codexSnapshots.id, snapshotId));
    return row ? rowToSnapshot(row) : null;
};

export const getPendingChangesForEntry = async (
    entryId: string,
    status?: CodexPendingStatus
): Promise<CodexPendingChange[]> => {
    const conditions = [eq(schema.codexPendingChanges.entryId, entryId)];
    if (status) conditions.push(eq(schema.codexPendingChanges.status, status));

    const rows = await db
        .select()
        .from(schema.codexPendingChanges)
        .where(and(...conditions))
        .orderBy(desc(schema.codexPendingChanges.createdAt));
    return rows.map(rowToPendingChange);
};

// Return all pending changes whose sourceRef starts with "chat:{chatId}" — covers both
// "chat:{chatId}" (no message) and "chat:{chatId}:msg:{messageId}" variants.
export const getPendingChangesByChatId = async (
    chatId: string,
    status?: CodexPendingStatus
): Promise<CodexPendingChange[]> => {
    const conditions = [like(schema.codexPendingChanges.sourceRef, `chat:${chatId}%`)];
    if (status) conditions.push(eq(schema.codexPendingChanges.status, status));

    const rows = await db
        .select()
        .from(schema.codexPendingChanges)
        .where(and(...conditions))
        .orderBy(desc(schema.codexPendingChanges.createdAt));
    return rows.map(rowToPendingChange);
};

export const getPendingChangeById = async (id: string): Promise<CodexPendingChange | null> => {
    const [row] = await db
        .select()
        .from(schema.codexPendingChanges)
        .where(eq(schema.codexPendingChanges.id, id));
    return row ? rowToPendingChange(row) : null;
};

export const resolvePendingChange = async (
    id: string,
    status: "approved" | "rejected"
): Promise<CodexPendingChange | null> => {
    const [row] = await db
        .update(schema.codexPendingChanges)
        .set({ status, resolvedAt: new Date() })
        .where(eq(schema.codexPendingChanges.id, id))
        .returning();
    return row ? rowToPendingChange(row) : null;
};

// Revise the proposed fields of a still-pending change in place (e.g. the conversation
// refines an earlier proposal before the user has approved/rejected it). Only the fields
// present in `fields` are touched; omit a field to leave it as-is.
export type RevisePendingChangeFields = Partial<{
    proposedDescription: string | null;
    proposedState: CodexState | null;
    proposedTags: string[] | null;
    proposedNeedsFleshingOut: boolean | null;
}>;

export const revisePendingChange = async (
    id: string,
    fields: RevisePendingChangeFields
): Promise<CodexPendingChange | null> => {
    const updates: Partial<typeof schema.codexPendingChanges.$inferInsert> = {};
    if (fields.proposedDescription !== undefined) updates.proposedDescription = fields.proposedDescription;
    if (fields.proposedState !== undefined) updates.proposedState = fields.proposedState;
    if (fields.proposedTags !== undefined) updates.proposedTags = fields.proposedTags;
    if (fields.proposedNeedsFleshingOut !== undefined) updates.proposedNeedsFleshingOut = fields.proposedNeedsFleshingOut;

    if (Object.keys(updates).length === 0) return getPendingChangeById(id);

    const [row] = await db
        .update(schema.codexPendingChanges)
        .set(updates)
        .where(eq(schema.codexPendingChanges.id, id))
        .returning();
    return row ? rowToPendingChange(row) : null;
};

// ── Mutations ──────────────────────────────────────────────────────────────────

export const createSnapshot = async (params: CreateSnapshotParams): Promise<CodexSnapshot> => {
    const [row] = await db
        .insert(schema.codexSnapshots)
        .values({
            id: crypto.randomUUID(),
            entryId: params.entryId,
            description: params.description,
            codexState: params.codexState,
            sourceType: params.sourceType,
            sourceRef: params.sourceRef ?? null,
            label: null,
            createdAt: new Date()
        })
        .returning();
    return rowToSnapshot(row);
};

// Set or clear a snapshot's user-given name (Project Saves Phase 1) — retroactive, not part of
// snapshot creation. Returns null if the snapshot doesn't exist.
export const setSnapshotLabel = async (snapshotId: string, label: string | null): Promise<CodexSnapshot | null> => {
    const [row] = await db
        .update(schema.codexSnapshots)
        .set({ label })
        .where(eq(schema.codexSnapshots.id, snapshotId))
        .returning();
    return row ? rowToSnapshot(row) : null;
};

export const createPendingChange = async (params: CreatePendingChangeParams): Promise<CodexPendingChange> => {
    const [row] = await db
        .insert(schema.codexPendingChanges)
        .values({
            id: crypto.randomUUID(),
            entryId: params.entryId,
            proposedDescription: params.proposedDescription ?? null,
            proposedState: params.proposedState ?? null,
            proposedTags: params.proposedTags ?? null,
            proposedNeedsFleshingOut: params.proposedNeedsFleshingOut ?? null,
            sourceType: params.sourceType,
            sourceRef: params.sourceRef ?? null,
            status: "pending",
            createdAt: new Date(),
            resolvedAt: null
        })
        .returning();
    return rowToPendingChange(row);
};
