import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "../db/client.js";
import type {
    CodexPendingChange,
    CodexSnapshot,
    CodexState
} from "../../src/types/codex.js";
import type { LorebookEntry } from "../../src/types/story.js";
import {
    createPendingChange,
    createSnapshot,
    getPendingChangeById,
    getPendingChangesByChatId,
    insertCodexEntry,
    revisePendingChange,
    type RevisePendingChangeFields
} from "./codexRepository.js";
import { proposeChange } from "./codexService.js";
import { getChatById } from "./chatRepository.js";
import type { CodexPendingStatus } from "../../src/types/codex.js";

type LorebookRow = InferSelectModel<typeof schema.lorebookEntries>;

// ── sourceRef helpers ──────────────────────────────────────────────────────────

// Format used by all chat-sourced codexPendingChanges and snapshots.
// Enables prefix-matching via getPendingChangesByChatId.
const buildSourceRef = (chatId: string, messageId?: string | null): string =>
    messageId ? `chat:${chatId}:msg:${messageId}` : `chat:${chatId}`;

// ── Validation ─────────────────────────────────────────────────────────────────

const getChatOrThrow = async (chatId: string) => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);
    return chat;
};

// ── Parameter types ────────────────────────────────────────────────────────────

export type ProposeModificationParams = {
    chatId: string;
    messageId?: string | null;
    entryId: string;
    proposedDescription?: string;
    proposedState?: CodexState;
    proposedTags?: string[];
    proposedNeedsFleshingOut?: boolean;
};

export type ProposeNewEntryParams = {
    chatId: string;
    messageId?: string | null;
    level: LorebookEntry["level"];
    scopeId?: string | null;
    name: string;
    description: string;
    category: LorebookEntry["category"];
    tags?: string[];
    proposedState?: CodexState | null;
};

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * Propose a change to an EXISTING Codex entry from a World-Building Chat.
 * Creates a codexPendingChange with sourceType "chat" and a sourceRef that
 * traces back to the specific chat (and optionally message).
 * The live entry is not modified — the user must approve first.
 */
export const proposeEntryModification = async (
    params: ProposeModificationParams
): Promise<CodexPendingChange> => {
    await getChatOrThrow(params.chatId);

    return proposeChange(
        params.entryId,
        {
            proposedDescription: params.proposedDescription,
            proposedState: params.proposedState,
            proposedTags: params.proposedTags,
            proposedNeedsFleshingOut: params.proposedNeedsFleshingOut
        },
        "chat",
        buildSourceRef(params.chatId, params.messageId)
    );
};

/**
 * Propose a BRAND-NEW Codex entry from a World-Building Chat.
 *
 * To satisfy the non-destructive constraint (all changes via codexPendingChanges)
 * while also providing an entry ID for the FK, the flow is:
 *   1. Create a stub lorebook entry immediately (codexEnabled, needsFleshingOut=true).
 *   2. Take an initial snapshot with the chat as source.
 *   3. Create a codexPendingChange on the stub with the full proposed content.
 *      On approval: proposed fields are applied and needsFleshingOut cleared.
 *      On rejection: stub remains, still flagged as needsFleshingOut for manual attention.
 */
export const proposeNewEntry = async (
    params: ProposeNewEntryParams
): Promise<{ entry: LorebookRow; snapshot: CodexSnapshot; pendingChange: CodexPendingChange }> => {
    await getChatOrThrow(params.chatId);

    if (!params.name.trim()) throw new Error("name is required");
    if (!params.description.trim()) throw new Error("description is required");
    if (params.level !== "global" && !params.scopeId)
        throw new Error(`scopeId is required for level '${params.level}'`);

    const sourceRef = buildSourceRef(params.chatId, params.messageId);

    // 1. Create stub — visible in the lorebook immediately so users can see what was proposed
    const entry = await insertCodexEntry({
        level: params.level,
        scopeId: params.scopeId ?? null,
        name: params.name.trim(),
        description: params.description.trim(),
        category: params.category,
        tags: params.tags ?? [],
        needsFleshingOut: true
    });

    // 2. Initial snapshot records the chat as the origin of this entry
    const snapshot = await createSnapshot({
        entryId: entry.id,
        description: entry.description,
        codexState: null,
        sourceType: "chat",
        sourceRef
    });

    // 3. Pending change holds the full proposed content.
    //    proposedNeedsFleshingOut: false — approval marks the entry as fully fleshed out.
    const pendingChange = await createPendingChange({
        entryId: entry.id,
        proposedDescription: params.description.trim(),
        proposedState: params.proposedState ?? null,
        proposedTags: params.tags ?? null,
        proposedNeedsFleshingOut: false,
        sourceType: "chat",
        sourceRef
    });

    return { entry, snapshot, pendingChange };
};

/**
 * List all pending Codex changes that originated from a specific chat.
 * Uses a sourceRef prefix match on "chat:{chatId}*".
 */
export const getChatCodexProposals = async (
    chatId: string,
    status?: CodexPendingStatus
): Promise<CodexPendingChange[]> => {
    await getChatOrThrow(chatId);
    return getPendingChangesByChatId(chatId, status);
};

// A pending change "belongs" to a chat when its sourceRef is "chat:{chatId}" or
// "chat:{chatId}:msg:{messageId}" — same prefix rule used by getPendingChangesByChatId.
const belongsToChat = (pending: CodexPendingChange, chatId: string): boolean =>
    pending.sourceRef === `chat:${chatId}` || (pending.sourceRef?.startsWith(`chat:${chatId}:msg:`) ?? false);

/**
 * Fetch a single pending Codex proposal, scoped to a specific chat — lets a chat
 * "reference" a proposal it previously made (e.g. to check on or follow up on it).
 * Throws if the proposal doesn't exist or didn't originate from this chat.
 */
export const getChatProposal = async (chatId: string, pendingChangeId: string): Promise<CodexPendingChange> => {
    await getChatOrThrow(chatId);

    const pending = await getPendingChangeById(pendingChangeId);
    if (!pending) throw new Error(`Pending change not found: ${pendingChangeId}`);
    if (!belongsToChat(pending, chatId)) throw new Error("This proposal did not originate from this chat");

    return pending;
};

export type ReviseProposalParams = {
    chatId: string;
    pendingChangeId: string;
    proposedDescription?: string;
    proposedState?: CodexState;
    proposedTags?: string[];
    proposedNeedsFleshingOut?: boolean;
};

/**
 * Revise an existing pending Codex proposal from this same chat — e.g. the conversation
 * continues and refines an earlier proposal before the user approves/rejects it, so the
 * chat updates the proposal in place instead of creating a competing duplicate.
 * Only allowed while the proposal is still 'pending' and it originated from this chat.
 */
export const reviseChatProposal = async (params: ReviseProposalParams): Promise<CodexPendingChange> => {
    const pending = await getChatProposal(params.chatId, params.pendingChangeId);
    if (pending.status !== "pending") throw new Error(`Cannot revise a change that is already '${pending.status}'`);

    const fields: RevisePendingChangeFields = {
        proposedDescription: params.proposedDescription,
        proposedState: params.proposedState,
        proposedTags: params.proposedTags,
        proposedNeedsFleshingOut: params.proposedNeedsFleshingOut
    };
    if (!Object.values(fields).some(v => v !== undefined))
        throw new Error("At least one field must change");

    const updated = await revisePendingChange(params.pendingChangeId, fields);
    if (!updated) throw new Error(`Failed to revise pending change: ${params.pendingChangeId}`);
    return updated;
};
