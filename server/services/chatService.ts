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

const APPEND_MAX_ATTEMPTS = 5;

/**
 * Append a single message to a chat's history.
 * Server assigns id and timestamp so clients can't forge them.
 *
 * B27 (docs/CODE_REVIEW_2026-08-17.md) — this is a read-modify-write (the array append itself
 * needs the current array), so it retries on a lost `messagesVersion` race instead of surfacing a
 * conflict: unlike a user-initiated edit/delete (replaceMessages below), losing this race just
 * means someone else's write landed a moment earlier, and re-reading+reappending is always the
 * right outcome, not something a user needs to resolve. `updateChatMessages`'s conditional UPDATE
 * (not a separate check-then-write) is what makes each attempt itself race-free.
 */
export const appendMessage = async (
    chatId: string,
    role: "user" | "assistant",
    content: string,
    // Context/Token Meter (T4, M3) — real provider usage for this turn, when the caller captured
    // one (Local only this pass — see streamUtils.ts/LocalAIProvider.generate()).
    usage?: ChatMessage["usage"]
): Promise<ChatRow> => {
    if (!content.trim()) throw new Error("Message content cannot be empty");

    const newMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content: content.trim(),
        timestamp: new Date(),
        ...(usage ? { usage } : {})
    };

    for (let attempt = 0; attempt < APPEND_MAX_ATTEMPTS; attempt++) {
        const chat = await getOrThrow(chatId);
        const updated = await updateChatMessages(chatId, [...chat.messages, newMessage], chat.messagesVersion);
        if (updated) return updated;
        // Lost the race — another write landed between our read and write. Loop re-reads fresh.
    }
    throw new Error(`Failed to append message to chat after repeated conflicts: ${chatId}`);
};

// Thrown by replaceMessages on a lost optimistic-concurrency race — routes/chats.ts's PATCH
// handler catches this specifically to respond 409 with the current chat, distinct from every
// other failure (which stays a generic 500).
export class MessagesVersionConflictError extends Error {
    latest: ChatRow;
    constructor(latest: ChatRow) {
        super("This chat's messages changed elsewhere since you last loaded them.");
        this.name = "MessagesVersionConflictError";
        this.latest = latest;
    }
}

/**
 * Replace the full message history for a chat.
 * Used when the client has edited or deleted messages locally.
 *
 * B27 — user-initiated, unlike appendMessage above: a lost race here means another tab/pane (or
 * the in-flight streaming reply this same tab just sent) wrote a message this array doesn't know
 * about, so silently overwriting would lose it. `expectedVersion` is optional so any caller that
 * doesn't send one (there is none left client-side, but a stray external API caller shouldn't
 * hard-break) still gets the old unconditional-write behavior.
 */
export const replaceMessages = async (
    chatId: string,
    messages: ChatMessage[],
    expectedVersion?: number
): Promise<ChatRow> => {
    await getOrThrow(chatId);
    const updated = await updateChatMessages(chatId, messages, expectedVersion);
    if (updated) return updated;

    if (typeof expectedVersion !== "number") throw new Error(`Failed to update messages for chat: ${chatId}`);
    throw new MessagesVersionConflictError(await getOrThrow(chatId));
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
