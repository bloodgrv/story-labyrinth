import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { DeskTransfer, DeskTransferEvent, DeskTransferKind } from "../../src/types/deskTransfer.js";

// Desk Transfer Log (docs/Transfer_Log_And_Settings_IA_Design.md) — a read-only historical send
// journal, genuinely separate from brainstormChecklist's Active-work tray (that table still owns
// Open/Send/Accept/Mark-done; this one is never mutated after insert, just pruned by age).

const UI_DEFAULT_WINDOW_DAYS = 30;
export const HARD_DELETE_AFTER_DAYS = 90;

type DeskTransferRow = typeof schema.deskTransfers.$inferSelect;

const toDeskTransfer = (row: DeskTransferRow): DeskTransfer => ({
    id: row.id,
    storyId: row.storyId,
    event: row.event as DeskTransferEvent,
    kind: row.kind as DeskTransferKind,
    fromDesk: row.fromDesk,
    fromChatId: row.fromChatId,
    fromChatTitleSnapshot: row.fromChatTitleSnapshot,
    toDesk: row.toDesk,
    toChatId: row.toChatId,
    toChatTitleSnapshot: row.toChatTitleSnapshot,
    subject: row.subject,
    crumb: row.crumb,
    sourceChecklistItemId: row.sourceChecklistItemId,
    createdAt: row.createdAt
});

export type LogTransferParams = {
    storyId: string;
    event: DeskTransferEvent;
    kind: DeskTransferKind;
    fromDesk: string;
    fromChatId?: string | null;
    fromChatTitleSnapshot?: string | null;
    toDesk: string;
    toChatId?: string | null;
    toChatTitleSnapshot?: string | null;
    subject: string;
    crumb?: string | null;
    sourceChecklistItemId?: string | null;
};

// Called from POST /stories/:storyId/transfers (deskTransfers.ts) — every writer lives in a
// client event handler, so this is reached via HTTP, not an internal-only call. Callers on the
// client fire this request without awaiting/blocking the real seed dispatch it's describing.
export const logTransfer = async (params: LogTransferParams): Promise<DeskTransfer> => {
    const [row] = await db
        .insert(schema.deskTransfers)
        .values({
            id: randomUUID(),
            storyId: params.storyId,
            event: params.event,
            kind: params.kind,
            fromDesk: params.fromDesk,
            fromChatId: params.fromChatId ?? null,
            fromChatTitleSnapshot: params.fromChatTitleSnapshot ?? null,
            toDesk: params.toDesk,
            toChatId: params.toChatId ?? null,
            toChatTitleSnapshot: params.toChatTitleSnapshot ?? null,
            subject: params.subject,
            crumb: params.crumb ?? null,
            sourceChecklistItemId: params.sourceChecklistItemId ?? null,
            createdAt: new Date()
        })
        .returning();
    return toDeskTransfer(row);
};

export type ListTransfersParams = {
    storyId: string;
    // Defaults to the UI's 30-day window; pass `all: true` for the "show older until 90d purge"
    // control (design doc §UI) rather than an arbitrary day count — 90d is also the hard-delete
    // boundary, so "all" already means "everything not yet pruned."
    all?: boolean;
};

export const listTransfers = async (params: ListTransfersParams): Promise<DeskTransfer[]> => {
    const conditions = [eq(schema.deskTransfers.storyId, params.storyId)];
    if (!params.all) {
        const cutoff = new Date(Date.now() - UI_DEFAULT_WINDOW_DAYS * 24 * 60 * 60_000);
        conditions.push(gte(schema.deskTransfers.createdAt, cutoff));
    }

    const rows = await db
        .select()
        .from(schema.deskTransfers)
        .where(and(...conditions))
        .orderBy(desc(schema.deskTransfers.createdAt));

    return rows.map(toDeskTransfer);
};

// 90-day hard delete — called from pruneHistoryJob.ts alongside its existing agentJobs cleanup
// (same cadence, same "narrow named rules" posture as that job's own header comment).
export const pruneOldTransfers = async (): Promise<number> => {
    const cutoff = new Date(Date.now() - HARD_DELETE_AFTER_DAYS * 24 * 60 * 60_000);
    const rows = await db.delete(schema.deskTransfers).where(lt(schema.deskTransfers.createdAt, cutoff)).returning({ id: schema.deskTransfers.id });
    return rows.length;
};
