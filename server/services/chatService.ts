import type { ChatMessage } from "../../src/types/story.js";
import {
    WORLD_BUILDING_TEMPLATES,
    getTemplate,
    type ChatType,
    type WorldBuildingTemplate,
    type WorldBuildingTemplateSlug
} from "../../src/types/worldbuilding.js";
import {
    createChat as repoCreateChat,
    deleteChat,
    getChatById,
    getChatsForStory,
    getGlobalChat,
    updateChatMessages,
    updateChatMeta,
    type ChatRow,
    type UpdateChatMetaFields
} from "./chatRepository.js";
import { resolveChatFolderId } from "./folderService.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const getOrThrow = async (chatId: string): Promise<ChatRow> => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);
    return chat;
};

// ── Template catalogue (pure, no DB) ──────────────────────────────────────────

export const getTemplates = (): readonly WorldBuildingTemplate[] =>
    WORLD_BUILDING_TEMPLATES;

// ── Chat creation ──────────────────────────────────────────────────────────────

export type CreateWorldBuildingChatParams = {
    storyId: string;
    templateSlug?: WorldBuildingTemplateSlug;
    title?: string;
    // The Lorebook entry this chat was opened from (WorldBuildingChatPanel), if any.
    anchorEntryId?: string | null;
};

/**
 * Create a World-Building Chat, optionally seeded from a template.
 * The title defaults to the template's defaultTitle when not supplied.
 */
export const createWorldBuildingChat = async (
    params: CreateWorldBuildingChatParams
): Promise<ChatRow> => {
    if (!params.storyId.trim()) throw new Error("storyId is required");

    const template = params.templateSlug ? getTemplate(params.templateSlug) : undefined;
    const title =
        params.title?.trim() ||
        template?.defaultTitle ||
        "World-Building";

    return repoCreateChat({
        storyId: params.storyId,
        title,
        chatType: "worldbuilding",
        templateSlug: params.templateSlug ?? null,
        anchorEntryId: params.anchorEntryId ?? null
    });
};

export type CreateGenericChatParams = {
    storyId: string;
    chatType: ChatType;
    title: string;
    // The chapter this chat was opened while focused on (EditorChatRail), if any.
    anchorChapterId?: string | null;
};

/**
 * Create a non-worldbuilding chat (research, editor, general).
 */
export const createGenericChat = async (
    params: CreateGenericChatParams
): Promise<ChatRow> => {
    if (!params.storyId.trim()) throw new Error("storyId is required");
    if (!params.title.trim()) throw new Error("title is required");
    if (params.chatType === "worldbuilding")
        throw new Error("Use createWorldBuildingChat for worldbuilding chats");

    return repoCreateChat({
        storyId: params.storyId,
        title: params.title.trim(),
        chatType: params.chatType,
        templateSlug: null,
        anchorChapterId: params.anchorChapterId ?? null
    });
};

/**
 * Get the single global chat of a type (e.g. Research — see CLAUDE.md's "Global Info/Research
 * Chat"), creating it if it doesn't exist yet. Server-side get-or-create avoids two concurrent
 * clients racing to each create their own copy.
 */
export const getOrCreateGlobalChat = async (chatType: ChatType, title: string): Promise<ChatRow> => {
    if (chatType === "worldbuilding") throw new Error("World-Building chats are always story-scoped");

    const existing = await getGlobalChat(chatType);
    if (existing) return existing;

    return repoCreateChat({ storyId: null, title, chatType, templateSlug: null });
};

// ── Message management ─────────────────────────────────────────────────────────

/**
 * Append a single message to a chat's history.
 * Server assigns id and timestamp so clients can't forge them.
 */
export const appendMessage = async (
    chatId: string,
    role: "user" | "assistant",
    content: string
): Promise<ChatRow> => {
    const chat = await getOrThrow(chatId);
    if (!content.trim()) throw new Error("Message content cannot be empty");

    const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content: content.trim(),
        timestamp: new Date()
    };

    const updated = await updateChatMessages(chatId, [...chat.messages, newMessage]);
    if (!updated) throw new Error(`Failed to append message to chat: ${chatId}`);
    return updated;
};

/**
 * Replace the full message history for a chat.
 * Used when the client has edited or deleted messages locally.
 */
export const replaceMessages = async (
    chatId: string,
    messages: ChatMessage[]
): Promise<ChatRow> => {
    await getOrThrow(chatId);
    const updated = await updateChatMessages(chatId, messages);
    if (!updated) throw new Error(`Failed to update messages for chat: ${chatId}`);
    return updated;
};

// ── Metadata updates ──────────────────────────────────────────────────────────

export const updateMeta = async (
    chatId: string,
    fields: UpdateChatMetaFields
): Promise<ChatRow> => {
    const chat = await getOrThrow(chatId);

    // Resolve folderId (B9, docs/Folders_Org_Design.md) — validates the folder belongs to this
    // chat's own story + chatType before it's ever persisted. Throws (→ 400 at the route) on a
    // mismatched explicit choice.
    let resolvedFields = fields;
    if (fields.folderId !== undefined) {
        const resolvedFolderId = await resolveChatFolderId(chat, fields);
        resolvedFields = { ...fields, folderId: resolvedFolderId ?? null };
    }

    const updated = await updateChatMeta(chatId, resolvedFields);
    if (!updated) throw new Error(`Failed to update chat: ${chatId}`);
    return updated;
};

// ── Retrieval ─────────────────────────────────────────────────────────────────

export { getChatsForStory, getChatById, deleteChat };
