import { attemptPromise } from "@jfdi/attempt";
import { type Request, type Response, Router } from "express";
import {
    appendMessage,
    archiveChat,
    createGenericChat,
    createGlobalChat,
    createWorldBuildingChat,
    deleteChat,
    getChatById,
    getChatsForStory,
    getTemplates,
    listArchivedChats,
    listGlobalChats,
    replaceMessages,
    unarchiveChat,
    updateMeta
} from "../services/chatService.js";
import {
    getChatCodexProposals,
    getChatProposal,
    proposeEntryModification,
    proposeNewEntry,
    reviseChatProposal
} from "../services/chatCodexService.js";
import { getCodexEntry } from "../services/codexRepository.js";
import { getChatContext } from "../services/chatContextService.js";
import type { ChatType, WorldBuildingTemplateSlug } from "../../src/types/worldbuilding.js";
import type { ChatMessage } from "../../src/types/story.js";
import type { CodexPendingStatus, CodexState } from "../../src/types/codex.js";
import type { LorebookEntry } from "../../src/types/story.js";

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
        const [error] = await attemptPromise(() => fn(req, res));
        if (error) {
            console.error("Chat error:", error);
            res.status(500).json({ error: error.message || "Server error" });
        }
    };

// ── GET /api/chats/templates ──────────────────────────────────────────────────
// List all built-in World-Building Chat templates.
// Must be defined before /:chatId to avoid "templates" being matched as a param.
router.get(
    "/templates",
    asyncHandler(async (_req, res) => {
        res.json(getTemplates());
    })
);

// ── GET /api/chats/archived ───────────────────────────────────────────────────
// List every archived chat (any story, any type) for the Settings review panel.
// Must be defined before /:chatId to avoid "archived" being matched as a param.
router.get(
    "/archived",
    asyncHandler(async (_req, res) => {
        const chats = await listArchivedChats();
        res.json(chats);
    })
);

// ── GET /api/chats ────────────────────────────────────────────────────────────
// List chats. Either a story's chats (storyId required, type optional) or a Global rail's chats
// (global=true, type required — e.g. Research's Global mode).
router.get(
    "/",
    asyncHandler(async (req, res) => {
        const { storyId, type, global } = req.query as { storyId?: string; type?: string; global?: string };

        if (global === "true") {
            if (!type) {
                res.status(400).json({ error: "type query parameter is required when global=true" });
                return;
            }
            const chats = await listGlobalChats(type as ChatType);
            res.json(chats);
            return;
        }

        if (!storyId) {
            res.status(400).json({ error: "storyId query parameter is required" });
            return;
        }
        const chats = await getChatsForStory(storyId, type as ChatType | undefined);
        res.json(chats);
    })
);

// ── POST /api/chats ───────────────────────────────────────────────────────────
// Create a new chat. Either a story-scoped chat or a Global (storyId-less) chat.
// Story-scoped body: { storyId, chatType, title?, templateSlug?, anchorEntryId?, anchorChapterId? }
//   chatType 'worldbuilding' → createWorldBuildingChat (templateSlug, anchorEntryId optional)
//   Other chatTypes → createGenericChat (title required; anchorChapterId optional for 'editor')
// Global body: { global: true, chatType: 'research', title } — only 'research' is global-eligible.
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { storyId, chatType, title, templateSlug, anchorEntryId, anchorChapterId, global } = req.body as {
            storyId?: string;
            chatType?: ChatType;
            title?: string;
            templateSlug?: string;
            anchorEntryId?: string | null;
            anchorChapterId?: string | null;
            global?: boolean;
        };

        if (global === true) {
            if (chatType !== "research") {
                res.status(400).json({ error: "Only research chats can be global" });
                return;
            }
            if (!title?.trim()) {
                res.status(400).json({ error: "title is required for global chats" });
                return;
            }
            const chat = await createGlobalChat({ chatType, title });
            res.status(201).json(chat);
            return;
        }

        if (!storyId) {
            res.status(400).json({ error: "storyId is required" });
            return;
        }

        let chat;
        if (!chatType || chatType === "worldbuilding") {
            chat = await createWorldBuildingChat({
                storyId,
                templateSlug: templateSlug as WorldBuildingTemplateSlug | undefined,
                title,
                anchorEntryId: anchorEntryId ?? null
            });
        } else {
            if (!title?.trim()) {
                res.status(400).json({ error: "title is required for non-worldbuilding chats" });
                return;
            }
            chat = await createGenericChat({ storyId, chatType, title, anchorChapterId: anchorChapterId ?? null });
        }

        res.status(201).json(chat);
    })
);

// ── GET /api/chats/:chatId ────────────────────────────────────────────────────
// Fetch a single chat with its full message history.
router.get(
    "/:chatId",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        res.json(chat);
    })
);

// ── PATCH /api/chats/:chatId ──────────────────────────────────────────────────
// Update a chat. Accepts any combination of:
//   messages: ChatMessage[]        — full replacement of message history
//   title: string                  — rename the chat
//   lastUsedPromptId: string|null  — track last prompt
//   lastUsedModelId: string|null   — track last model
//   includeNotes: boolean          — Notes/Outline bridge chat-level gate (docs/Notes_Outline_Chat_Bridges_Design.md)
//   includeOutline: boolean        — same, for outline items
//   includeMemory: boolean         — Project Memory chat-level gate (C1, Agent_Framework_And_Project_Memory_Design.md §4.5)
//   includeLorebook: boolean       — Brainstorm-only lorebook search opt-in (P0.4 B0-B4)
//   includeChapterSummaries: bool  — Brainstorm-only chapter titles+summaries opt-in (P0.4 B0-B4)
//   brainstormStyle: string        — Light|Standard|Grill-me (P0.4 B0-B4)
//   wbStyle: string                — Light|Standard|Grill-me, worldbuilding chats (P0.4 B5)
//   outlineStyle: string           — Light|Standard|Grill-me, outline chats (P0.4 B5)
//   includePsychModule: boolean    — Character template's opt-in psych module (P0.4 B5)
//   usePlaybookPack: boolean       — Character template's playbook pack arm toggle (Hybrid D)
//   autoInsertProse: boolean       — Editor-only auto-insert toggle (P0.4 R6)
//   autoAcceptCodex: boolean       — Editor/WB/Outline auto-accept Codex toggle (P0.4 R6)
//   autoAcceptOutline: boolean     — Outline-only auto-accept create/edit/reorder toggle, never delete (P0.4 R6)
//   webSearchEnabled: boolean      — Research-only, defaults true, off-switch for live web search (P0.4 S1)
//   autoShuttle: boolean           — Editor/Outline/WB-only always-shuttle pref (Chat Shuttle H7)
//   folderId: string|null          — cosmetic org folder (B9); null unfiles
router.patch(
    "/:chatId",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }

        const {
            messages,
            title,
            lastUsedPromptId,
            lastUsedModelId,
            includeNotes,
            includeOutline,
            includeMemory,
            includeLorebook,
            includeChapterSummaries,
            brainstormStyle,
            wbStyle,
            outlineStyle,
            includePsychModule,
            usePlaybookPack,
            autoInsertProse,
            autoAcceptCodex,
            autoAcceptOutline,
            webSearchEnabled,
            autoShuttle,
            folderId
        } = req.body as {
            messages?: unknown[];
            title?: string;
            lastUsedPromptId?: string | null;
            lastUsedModelId?: string | null;
            includeNotes?: boolean;
            includeOutline?: boolean;
            includeMemory?: boolean;
            includeLorebook?: boolean;
            includeChapterSummaries?: boolean;
            brainstormStyle?: string;
            wbStyle?: string;
            outlineStyle?: string;
            includePsychModule?: boolean;
            usePlaybookPack?: boolean;
            autoInsertProse?: boolean;
            autoAcceptCodex?: boolean;
            autoAcceptOutline?: boolean;
            webSearchEnabled?: boolean;
            autoShuttle?: boolean;
            folderId?: string | null; // B9, docs/Folders_Org_Design.md — null unfiles
        };

        let result = chat;

        // Apply message replacement first (if provided)
        if (messages !== undefined) {
            if (!Array.isArray(messages)) {
                res.status(400).json({ error: "messages must be an array" });
                return;
            }
            result = await replaceMessages(req.params.chatId, messages as ChatMessage[]);
        }

        // Apply metadata updates (if any)
        const metaFields: Record<string, unknown> = {};
        if (title !== undefined) metaFields.title = title;
        if (lastUsedPromptId !== undefined) metaFields.lastUsedPromptId = lastUsedPromptId;
        if (lastUsedModelId !== undefined) metaFields.lastUsedModelId = lastUsedModelId;
        if (includeNotes !== undefined) metaFields.includeNotes = includeNotes;
        if (includeOutline !== undefined) metaFields.includeOutline = includeOutline;
        if (includeMemory !== undefined) metaFields.includeMemory = includeMemory;
        if (includeLorebook !== undefined) metaFields.includeLorebook = includeLorebook;
        if (includeChapterSummaries !== undefined) metaFields.includeChapterSummaries = includeChapterSummaries;
        if (brainstormStyle !== undefined) metaFields.brainstormStyle = brainstormStyle;
        if (wbStyle !== undefined) metaFields.wbStyle = wbStyle;
        if (outlineStyle !== undefined) metaFields.outlineStyle = outlineStyle;
        if (includePsychModule !== undefined) metaFields.includePsychModule = includePsychModule;
        if (usePlaybookPack !== undefined) metaFields.usePlaybookPack = usePlaybookPack;
        if (autoInsertProse !== undefined) metaFields.autoInsertProse = autoInsertProse;
        if (autoAcceptCodex !== undefined) metaFields.autoAcceptCodex = autoAcceptCodex;
        if (autoAcceptOutline !== undefined) metaFields.autoAcceptOutline = autoAcceptOutline;
        if (webSearchEnabled !== undefined) metaFields.webSearchEnabled = webSearchEnabled;
        if (autoShuttle !== undefined) metaFields.autoShuttle = autoShuttle;
        if (folderId !== undefined) metaFields.folderId = folderId;

        if (Object.keys(metaFields).length > 0) {
            // folderId validation (resolveChatFolderId, called inside updateMeta) is a user
            // mistake, not a server error — 400, not 500, matching storyGraph.ts's convention.
            const [error, updated] = await attemptPromise(() =>
                updateMeta(
                    req.params.chatId,
                    metaFields as {
                        title?: string;
                        lastUsedPromptId?: string | null;
                        lastUsedModelId?: string | null;
                        includeNotes?: boolean;
                        includeOutline?: boolean;
                        includeMemory?: boolean;
                        includeLorebook?: boolean;
                        includeChapterSummaries?: boolean;
                        brainstormStyle?: string;
                        wbStyle?: string;
                        outlineStyle?: string;
                        includePsychModule?: boolean;
                        usePlaybookPack?: boolean;
                        autoInsertProse?: boolean;
                        autoAcceptCodex?: boolean;
                        autoAcceptOutline?: boolean;
                        webSearchEnabled?: boolean;
                        autoShuttle?: boolean;
                        folderId?: string | null;
                    }
                )
            );
            if (error) {
                res.status(400).json({ error: error.message });
                return;
            }
            result = updated;
        }

        res.json(result);
    })
);

// ── POST /api/chats/:chatId/messages ─────────────────────────────────────────
// Append a single message to a chat. Server assigns id and timestamp.
// Body: { role: 'user' | 'assistant', content: string }
router.post(
    "/:chatId/messages",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }

        const { role, content, usage } = req.body as {
            role?: string;
            content?: string;
            usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        };
        if (role !== "user" && role !== "assistant") {
            res.status(400).json({ error: "role must be 'user' or 'assistant'" });
            return;
        }
        if (!content?.trim()) {
            res.status(400).json({ error: "content is required" });
            return;
        }

        const updated = await appendMessage(req.params.chatId, role, content, usage);
        res.status(201).json(updated);
    })
);

// ── GET /api/chats/:chatId/codex-proposals ───────────────────────────────────
// List all Codex pending changes that originated from this chat.
// Query param: status (optional) — filter by 'pending' | 'approved' | 'rejected'
router.get(
    "/:chatId/codex-proposals",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        const { status } = req.query as { status?: string };
        const proposals = await getChatCodexProposals(
            req.params.chatId,
            status as CodexPendingStatus | undefined
        );
        res.json(proposals);
    })
);

// ── GET /api/chats/:chatId/codex-proposals/:pendingChangeId ─────────────────
// Fetch a single proposal, scoped to this chat — lets a chat "reference" a proposal
// it previously made. 404s if the proposal doesn't exist or belongs to another chat.
router.get(
    "/:chatId/codex-proposals/:pendingChangeId",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        const proposal = await getChatProposal(req.params.chatId, req.params.pendingChangeId);
        res.json(proposal);
    })
);

// ── PATCH /api/chats/:chatId/codex-proposals/:pendingChangeId ───────────────
// Revise an existing pending proposal from this chat in place (rather than creating a
// competing duplicate) — e.g. the conversation refines an earlier proposal before the
// user approves/rejects it. Only allowed while the proposal is still 'pending'.
// Body: any subset of { proposedDescription, proposedState, proposedTags, proposedNeedsFleshingOut }
router.patch(
    "/:chatId/codex-proposals/:pendingChangeId",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }

        const { proposedDescription, proposedState, proposedTags, proposedNeedsFleshingOut } = req.body as {
            proposedDescription?: string;
            proposedState?: CodexState;
            proposedTags?: string[];
            proposedNeedsFleshingOut?: boolean;
        };

        const revised = await reviseChatProposal({
            chatId: req.params.chatId,
            pendingChangeId: req.params.pendingChangeId,
            proposedDescription,
            proposedState,
            proposedTags,
            proposedNeedsFleshingOut
        });
        res.json(revised);
    })
);

// ── GET /api/chats/:chatId/context ───────────────────────────────────────────
// Assemble the effective system prompt (template hint included), this chat's own
// unresolved Codex proposals, and Codex entries relevant to `query` (via the RAG hybrid
// index — defaults to the chat's title when omitted). Meant to be fetched before sending
// a message to the AI provider, so responses/proposals are grounded in current Codex state.
// Query params: query (optional), focusedNoteId (optional — Notes chats only, P0.4 K1: whichever
// note is currently open in the Notes tool, see getChatContext's resolveFocusedNote)
router.get(
    "/:chatId/context",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        const { query, focusedNoteId } = req.query as { query?: string; focusedNoteId?: string };
        const context = await getChatContext(req.params.chatId, query, focusedNoteId);
        res.json(context);
    })
);

// ── POST /api/chats/:chatId/codex-proposals ──────────────────────────────────
// Create a Codex proposal (new entry or modification) from a chat message.
//
// Body for new entry:
//   { type: "new_entry", messageId?, level, scopeId?, name, description, category, tags?, proposedState? }
//
// Body for modification:
//   { type: "modify_entry", messageId?, entryId,
//     proposedDescription?, proposedState?, proposedTags?, proposedNeedsFleshingOut? }
router.post(
    "/:chatId/codex-proposals",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }

        const { type, messageId } = req.body as { type?: string; messageId?: string };

        if (type === "new_entry") {
            const { level, scopeId, name, description, category, tags, proposedState } =
                req.body as {
                    level?: string;
                    scopeId?: string | null;
                    name?: string;
                    description?: string;
                    category?: string;
                    tags?: string[];
                    proposedState?: unknown;
                };

            if (!level || !name || !description || !category) {
                res.status(400).json({
                    error: "level, name, description, and category are required for new_entry"
                });
                return;
            }

            // The AI has no legitimate way to know this story's UUID (it's an internal DB id,
            // never surfaced in chat), so the system prompt's proposal example omits scopeId
            // entirely (see CODEX_PROPOSAL_INSTRUCTIONS in chatContextService.ts). Default it
            // from the chat's own story here rather than requiring the model to supply it.
            const resolvedScopeId = level === "story" ? (scopeId ?? chat.storyId) : (scopeId ?? null);

            const result = await proposeNewEntry({
                chatId: req.params.chatId,
                messageId: messageId ?? null,
                level: level as "global" | "series" | "story",
                scopeId: resolvedScopeId,
                name,
                description,
                category: category as LorebookEntry["category"],
                tags,
                proposedState: proposedState as CodexState | null
            });

            res.status(201).json(result);
            return;
        }

        if (type === "modify_entry") {
            const {
                entryId,
                proposedDescription,
                proposedState,
                proposedTags,
                proposedNeedsFleshingOut
            } = req.body as {
                entryId?: string;
                proposedDescription?: string;
                proposedState?: unknown;
                proposedTags?: string[];
                proposedNeedsFleshingOut?: boolean;
            };

            if (!entryId) {
                res.status(400).json({ error: "entryId is required for modify_entry" });
                return;
            }

            // A model reply occasionally grounds this on the entry's NAME instead of the real
            // entryId from the Codex context (despite CODEX_PROPOSAL_INSTRUCTIONS telling it to
            // use the id) — without this check that falls through to codexService's generic
            // getOrThrow(), which throws a plain Error and previously surfaced as an opaque 500
            // via the app's catch-all error handler instead of a clean, actionable failure.
            const existingEntry = await getCodexEntry(entryId);
            if (!existingEntry) {
                res.status(404).json({
                    error: `No Codex entry found with id "${entryId}" — this proposal wasn't recorded. ` +
                        "The model may have used the entry's name instead of its id; try asking it to retry."
                });
                return;
            }

            const pendingChange = await proposeEntryModification({
                chatId: req.params.chatId,
                messageId: messageId ?? null,
                entryId,
                proposedDescription,
                proposedState: proposedState as CodexState | undefined,
                proposedTags,
                proposedNeedsFleshingOut
            });

            res.status(201).json({ pendingChange });
            return;
        }

        res.status(400).json({ error: "type must be 'new_entry' or 'modify_entry'" });
    })
);

// ── POST /api/chats/:chatId/archive ───────────────────────────────────────────
// Archive a chat (soft-delete) — hides it from its rail's normal list without deleting it.
router.post(
    "/:chatId/archive",
    asyncHandler(async (req, res) => {
        const existing = await getChatById(req.params.chatId);
        if (!existing) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        const chat = await archiveChat(req.params.chatId);
        res.json(chat);
    })
);

// ── POST /api/chats/:chatId/unarchive ─────────────────────────────────────────
// Restore an archived chat back into its rail's normal list.
router.post(
    "/:chatId/unarchive",
    asyncHandler(async (req, res) => {
        const existing = await getChatById(req.params.chatId);
        if (!existing) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        const chat = await unarchiveChat(req.params.chatId);
        res.json(chat);
    })
);

// ── DELETE /api/chats/:chatId ─────────────────────────────────────────────────
// Permanently delete a chat and all its messages. Only reachable from the Settings "Archived
// Chats" panel now — the normal rails' delete action was replaced by archive above.
router.delete(
    "/:chatId",
    asyncHandler(async (req, res) => {
        const chat = await getChatById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ error: "Chat not found" });
            return;
        }
        await deleteChat(req.params.chatId);
        res.status(204).send();
    })
);

export default router;
