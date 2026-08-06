import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
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
    includeNotes: boolean;
    includeOutline: boolean;
    includeMemory: boolean;
    includeLorebook: boolean;
    includeChapterSummaries: boolean;
    brainstormStyle: string;
    wbStyle: string;
    outlineStyle: string;
    includePsychModule: boolean;
    usePlaybookPack: boolean;
    autoInsertProse: boolean;
    autoAcceptCodex: boolean;
    autoAcceptOutline: boolean;
    webSearchEnabled: boolean;
    autoShuttle: boolean;
    folderId: string | null;
}>;

// ── Queries ────────────────────────────────────────────────────────────────────

export const getChatsForStory = async (
    storyId: string,
    chatType?: ChatType
): Promise<ChatRow[]> => {
    const conditions = [eq(schema.aiChats.storyId, storyId), isNull(schema.aiChats.archivedAt)];
    if (chatType) conditions.push(eq(schema.aiChats.chatType, chatType));

    const rows = await db
        .select()
        .from(schema.aiChats)
        .where(and(...conditions))
        .orderBy(desc(schema.aiChats.updatedAt), desc(schema.aiChats.createdAt));

    return rows.map(toChat);
};

// All (non-archived) global chats of a given type (storyId IS NULL) — e.g. the Research Global
// rail. Replaces the old single-get-or-create-chat getGlobalChat now that Global is a real list.
export const getGlobalChats = async (chatType: ChatType): Promise<ChatRow[]> => {
    const rows = await db
        .select()
        .from(schema.aiChats)
        .where(
            and(
                isNull(schema.aiChats.storyId),
                eq(schema.aiChats.chatType, chatType),
                isNull(schema.aiChats.archivedAt)
            )
        )
        .orderBy(desc(schema.aiChats.updatedAt), desc(schema.aiChats.createdAt));
    return rows.map(toChat);
};

// Every archived chat (any story, any type), newest-archived first — for the Settings review
// panel only. Left-joined to stories for a display title (null for Global chats).
export const getArchivedChats = async (): Promise<Array<ChatRow & { storyTitle: string | null }>> => {
    const rows = await db
        .select({ chat: schema.aiChats, storyTitle: schema.stories.title })
        .from(schema.aiChats)
        .leftJoin(schema.stories, eq(schema.aiChats.storyId, schema.stories.id))
        .where(isNotNull(schema.aiChats.archivedAt))
        .orderBy(desc(schema.aiChats.archivedAt));
    return rows.map(({ chat, storyTitle }) => ({ ...toChat(chat), storyTitle: storyTitle ?? null }));
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
    if (fields.includeNotes !== undefined) updates.includeNotes = fields.includeNotes;
    if (fields.includeOutline !== undefined) updates.includeOutline = fields.includeOutline;
    if (fields.includeMemory !== undefined) updates.includeMemory = fields.includeMemory;
    if (fields.includeLorebook !== undefined) updates.includeLorebook = fields.includeLorebook;
    if (fields.includeChapterSummaries !== undefined) updates.includeChapterSummaries = fields.includeChapterSummaries;
    if (fields.brainstormStyle !== undefined) updates.brainstormStyle = fields.brainstormStyle;
    if (fields.wbStyle !== undefined) updates.wbStyle = fields.wbStyle;
    if (fields.outlineStyle !== undefined) updates.outlineStyle = fields.outlineStyle;
    if (fields.includePsychModule !== undefined) updates.includePsychModule = fields.includePsychModule;
    if (fields.usePlaybookPack !== undefined) updates.usePlaybookPack = fields.usePlaybookPack;
    if (fields.autoInsertProse !== undefined) updates.autoInsertProse = fields.autoInsertProse;
    if (fields.autoAcceptCodex !== undefined) updates.autoAcceptCodex = fields.autoAcceptCodex;
    if (fields.autoAcceptOutline !== undefined) updates.autoAcceptOutline = fields.autoAcceptOutline;
    if (fields.webSearchEnabled !== undefined) updates.webSearchEnabled = fields.webSearchEnabled;
    if (fields.autoShuttle !== undefined) updates.autoShuttle = fields.autoShuttle;
    if (fields.folderId !== undefined) updates.folderId = fields.folderId;

    const [row] = await db
        .update(schema.aiChats)
        .set(updates)
        .where(eq(schema.aiChats.id, id))
        .returning();
    return row ? toChat(row) : null;
};

export const archiveChat = async (id: string): Promise<ChatRow | null> => {
    const [row] = await db
        .update(schema.aiChats)
        .set({ archivedAt: new Date() })
        .where(eq(schema.aiChats.id, id))
        .returning();
    return row ? toChat(row) : null;
};

export const unarchiveChat = async (id: string): Promise<ChatRow | null> => {
    const [row] = await db
        .update(schema.aiChats)
        .set({ archivedAt: null })
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
