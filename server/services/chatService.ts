import type { ChatMessage } from "../../src/types/story.js";
import {
    WORLD_BUILDING_TEMPLATES,
    getTemplate,
    type ChatType,
    type WorldBuildingTemplate,
    type WorldBuildingTemplateSlug
} from "../../src/types/worldbuilding.js";
import {
    archiveChat as repoArchiveChat,
    createChat as repoCreateChat,
    deleteChat,
    getArchivedChats,
    getChatById,
    getChatsForStory,
    getGlobalChats,
    unarchiveChat as repoUnarchiveChat,
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
 * Create a new Global (storyId-less) chat — e.g. Research's Global rail. Unlike the old
 * single-get-or-create-chat model, this always creates a new row; the rail's own
 * auto-select-most-recent-or-create effect decides when to call it. Restricted to Research for
 * now — the only desk with a Global identity (see CLAUDE.md's Research desk section).
 */
export const createGlobalChat = async (params: { chatType: ChatType; title: string }): Promise<ChatRow> => {
    if (params.chatType !== "research") throw new Error("Only research chats can be global");
    if (!params.title.trim()) throw new Error("title is required");

    return repoCreateChat({ storyId: null, title: params.title.trim(), chatType: params.chatType, templateSlug: null });
};

export const listGlobalChats = async (chatType: ChatType): Promise<ChatRow[]> => getGlobalChats(chatType);

export const listArchivedChats = () => getArchivedChats();

export const archiveChat = async (chatId: string): Promise<ChatRow> => {
    const updated = await repoArchiveChat(chatId);
    if (!updated) throw new Error(`Chat not found: ${chatId}`);
    return updated;
};

export const unarchiveChat = async (chatId: string): Promise<ChatRow> => {
    const updated = await repoUnarchiveChat(chatId);
    if (!updated) throw new Error(`Chat not found: ${chatId}`);
    return updated;
};

// ── Message management ─────────────────────────────────────────────────────────

/**
 * Append a single message to a chat's history.
 * Server assigns id and timestamp so clients can't forge them.
 */
export const appendMessage = async (
    chatId: string,
    role: "user" | "assistant",
    content: string,
    // Context/Token Meter (T4, M3) — real provider usage for this turn, when the caller captured
    // one (Local only this pass — see streamUtils.ts/LocalAIProvider.generate()).
    usage?: ChatMessage["usage"]
): Promise<ChatRow> => {
    const chat = await getOrThrow(chatId);
    if (!content.trim()) throw new Error("Message content cannot be empty");

    const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content: content.trim(),
        timestamp: new Date(),
        ...(usage ? { usage } : {})
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
