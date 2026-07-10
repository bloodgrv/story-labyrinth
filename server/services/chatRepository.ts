import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { parseJson } from "../lib/json.js";
import type { ChatMessage } from "../../src/types/story.js";
import type { ChatType, WorldBuildingTemplateSlug } from "../../src/types/worldbuilding.js";

export type AiChatRow = typeof schema.aiChats.$inferSelect;

// Parse the messages JSON column into a typed array.
// Consistent with the codebase pattern: better-sqlite3 does not auto-parse json columns.
const parseMessages = (row: AiChatRow): ChatMessage[] =>
    (parseJson(row.messages) as ChatMessage[] | null) ?? [];

// Normalise a raw aiChats row for callers — messages column is parsed to an array.
export const toChat = (row: AiChatRow) => ({
    ...row,
    messages: parseMessages(row),
    chatType: (row.chatType as ChatType | null) ?? null,
    templateSlug: (row.templateSlug as WorldBuildingTemplateSlug | null) ?? null
});

export type ChatRow = ReturnType<typeof toChat>;

// ── Input types ────────────────────────────────────────────────────────────────

export type CreateChatParams = {
    storyId: string | null;
    title: string;
    chatType: ChatType;
    templateSlug?: WorldBuildingTemplateSlug | null;
    // The Lorebook entry this chat was opened from, if any — see schema.ts's aiChats.anchorEntryId.
    anchorEntryId?: string | null;
    // The chapter this chat was opened while focused on, if any — see schema.ts's aiChats.anchorChapterId.
    anchorChapterId?: string | null;
};

export type UpdateChatMetaFields = Partial<{
    title: string;
    lastUsedPromptId: string | null;
    lastUsedModelId: string | null;
}>;

// ── Queries ────────────────────────────────────────────────────────────────────

export const getChatsForStory = async (
    storyId: string,
    chatType?: ChatType
): Promise<ChatRow[]> => {
    const conditions = [eq(schema.aiChats.storyId, storyId)];
    if (chatType) conditions.push(eq(schema.aiChats.chatType, chatType));

    const rows = await db
        .select()
        .from(schema.aiChats)
        .where(and(...conditions))
        .orderBy(desc(schema.aiChats.updatedAt), desc(schema.aiChats.createdAt));

    return rows.map(toChat);
};

// The single global chat of a given type (storyId IS NULL) — e.g. the one Research chat.
export const getGlobalChat = async (chatType: ChatType): Promise<ChatRow | null> => {
    const [row] = await db
        .select()
        .from(schema.aiChats)
        .where(and(isNull(schema.aiChats.storyId), eq(schema.aiChats.chatType, chatType)))
        .orderBy(desc(schema.aiChats.createdAt))
        .limit(1);
    return row ? toChat(row) : null;
};

export const getChatById = async (id: string): Promise<ChatRow | null> => {
    const [row] = await db
        .select()
        .from(schema.aiChats)
        .where(eq(schema.aiChats.id, id));
    return row ? toChat(row) : null;
};

// ── Mutations ──────────────────────────────────────────────────────────────────

export const createChat = async (params: CreateChatParams): Promise<ChatRow> => {
    const [row] = await db
        .insert(schema.aiChats)
        .values({
            id: crypto.randomUUID(),
            storyId: params.storyId,
            title: params.title,
            messages: [],
            chatType: params.chatType,
            templateSlug: params.templateSlug ?? null,
            anchorEntryId: params.anchorEntryId ?? null,
            anchorChapterId: params.anchorChapterId ?? null,
            createdAt: new Date(),
            updatedAt: new Date()
        })
        .returning();
    return toChat(row);
};

export const updateChatMessages = async (
    id: string,
    messages: ChatMessage[]
): Promise<ChatRow | null> => {
    const [row] = await db
        .update(schema.aiChats)
        .set({ messages, updatedAt: new Date() })
        .where(eq(schema.aiChats.id, id))
        .returning();
    return row ? toChat(row) : null;
};

export const updateChatMeta = async (
    id: string,
    fields: UpdateChatMetaFields
): Promise<ChatRow | null> => {
    const updates: Partial<typeof schema.aiChats.$inferInsert> = {
        updatedAt: new Date()
    };
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.lastUsedPromptId !== undefined) updates.lastUsedPromptId = fields.lastUsedPromptId;
    if (fields.lastUsedModelId !== undefined) updates.lastUsedModelId = fields.lastUsedModelId;

    const [row] = await db
        .update(schema.aiChats)
        .set(updates)
        .where(eq(schema.aiChats.id, id))
        .returning();
    return row ? toChat(row) : null;
};

export const deleteChat = async (id: string): Promise<boolean> => {
    const result = await db
        .delete(schema.aiChats)
        .where(eq(schema.aiChats.id, id))
        .returning({ id: schema.aiChats.id });
    return result.length > 0;
};
