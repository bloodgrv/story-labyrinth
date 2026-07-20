import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db/client.js";
import { parseJson } from "../lib/json.js";
import type { BrainstormChecklistItem, BrainstormChecklistKind, BrainstormChecklistPayload } from "../../src/types/brainstorm.js";

// Backing store for P0.4 B4's durable tray — see schema.ts's brainstormChecklist comment for why
// this is a genuinely different status lifecycle than codexPendingChanges (Open/Send/Accept do
// NOT resolve/remove an item; only an explicit "Mark done" does).
const ACTIVE_STATUSES = ["pending", "opened"] as const;
const DONE_STATUSES = ["done", "dismissed"] as const;

type ChecklistRow = typeof schema.brainstormChecklist.$inferSelect;

const toItem = (row: ChecklistRow): BrainstormChecklistItem => ({
    id: row.id,
    chatId: row.chatId,
    storyId: row.storyId,
    kind: row.kind as BrainstormChecklistKind,
    status: row.status as BrainstormChecklistItem["status"],
    payload: parseJson(row.payload as string) as BrainstormChecklistPayload,
    sourceMessageId: row.sourceMessageId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
});

export type CreateChecklistItemParams = {
    chatId: string;
    storyId: string;
    kind: BrainstormChecklistKind;
    payload: BrainstormChecklistPayload;
    sourceMessageId?: string | null;
};

export const createChecklistItem = async (params: CreateChecklistItemParams): Promise<BrainstormChecklistItem> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.brainstormChecklist)
        .values({
            id: randomUUID(),
            chatId: params.chatId,
            storyId: params.storyId,
            kind: params.kind,
            status: "pending",
            payload: params.payload,
            sourceMessageId: params.sourceMessageId ?? null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return toItem(row);
};

export const listChecklistItems = async (chatId: string, filter: "active" | "done"): Promise<BrainstormChecklistItem[]> => {
    const statuses = filter === "active" ? ACTIVE_STATUSES : DONE_STATUSES;
    const rows = await db
        .select()
        .from(schema.brainstormChecklist)
        .where(and(eq(schema.brainstormChecklist.chatId, chatId), inArray(schema.brainstormChecklist.status, [...statuses])))
        .orderBy(desc(schema.brainstormChecklist.createdAt));
    return rows.map(toItem);
};

export const updateChecklistStatus = async (
    id: string,
    status: BrainstormChecklistItem["status"]
): Promise<BrainstormChecklistItem | null> => {
    const [row] = await db
        .update(schema.brainstormChecklist)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.brainstormChecklist.id, id))
        .returning();
    return row ? toItem(row) : null;
};

// Used by chatContextService.ts's resolveHandoffStatus — a plain count, not the full row list.
export const getChecklistCounts = async (chatId: string, filter: "active" | "done"): Promise<number> => {
    const statuses = filter === "active" ? ACTIVE_STATUSES : DONE_STATUSES;
    const rows = await db
        .select({ id: schema.brainstormChecklist.id })
        .from(schema.brainstormChecklist)
        .where(and(eq(schema.brainstormChecklist.chatId, chatId), inArray(schema.brainstormChecklist.status, [...statuses])));
    return rows.length;
};
