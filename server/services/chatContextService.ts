import { and, eq, inArray, ne, or } from "drizzle-orm";
import type {
    ChatContext,
    ChatContextChapterPassage,
    ChatContextCodexEntry,
    ChatContextGuideExcerpt,
    ChatContextMemoryExcerpt,
    ChatContextNoteExcerpt,
    ChatContextOutlineExcerpt,
    ChatContextOutlineTreeItem,
    ChatContextPlaybookPack,
    ChatContextWrittenChapter,
    ChatType
} from "../../src/types/worldbuilding.js";
import type { CodexState } from "../../src/types/codex.js";
import { getTemplate } from "../../src/types/worldbuilding.js";
import { BRAINSTORM_SLOTS } from "../../src/types/brainstorm.js";
import { getChecklistCounts } from "./brainstormChecklistService.js";
import { getSlots } from "./brainstormSlotsService.js";
import { db, schema } from "../db/client.js";
import { parseJson } from "../lib/json.js";
import { getChatCodexProposals } from "./chatCodexService.js";
import { getChatById } from "./chatRepository.js";
import { listPoolsForScope } from "./nameGeneratorRepository.js";
import { resolvePlaybookPack as resolvePlaybookPackLadder } from "./playbookPackService.js";
import { search } from "./ragIndexService.js";
import { DEFAULT_SEARCH_ENTITY_TYPES, type RagEntityType, type SearchResult } from "./ragRepository.js";
import { fetchPage, searchWeb, type FetchedPage } from "./webSearchService.js";
import { getSpineChronologyExcerpt } from "./storyTimelineService.js";
import { searchGuideForChat } from "./guideSearchService.js";
import { listChatVisibleConnections } from "./mcpConnectionService.js";

const RELEVANT_ENTRIES_LIMIT = 8;
// MCP M2, docs/MCP_Tool_Connections_Design.md §3.3 "Budget | Hard token/tool cap; visible 'N tools
// omitted' if truncated" — mirrors CHARACTER_ROSTER_CAP's shape (cap + honest truncated flag)
// rather than RELEVANT_ENTRIES_LIMIT's silent slice, since the design explicitly wants disclosure.
const MCP_TOOL_CATALOGUE_LIMIT = 20;
// B6 (docs/BUGS_2026-08-19.md) — the character roster is deliberately NOT RAG-ranked/capped like
// RELEVANT_ENTRIES_LIMIT above; this ceiling only guards against a pathologically large cast, not
// relevance filtering. Names-only, so even 300 entries is cheap.
const CHARACTER_ROSTER_CAP = 300;
const SEARCH_POOL_SIZE = RELEVANT_ENTRIES_LIMIT * 2;

// Shared by both World-Building and Editor chats — the ```codex-proposal fenced-block
// convention is this app's only mechanism for turning a chat reply into an actual Codex
// change (no server-side parsing of free text — see chatCodexService.ts), so the exact JSON
// shape here must match POST /api/chats/:chatId/codex-proposals's body (server/routes/chats.ts)
// and what src/features/chat/services/parseCodexProposals.ts extracts client-side.
const CODEX_PROPOSAL_INSTRUCTIONS =
    "When you learn a new concrete fact, or a character/location/item's physical state changes, " +
    "you MUST propose it as a Codex entry or update in that same reply — never just state it in " +
    "conversation as if it were already canon, and never just describe the change in prose and wait " +
    "to be asked to formalize it; the fence IS how you propose it. If the user directly asks you to " +
    "write up or propose a character/location/item now — even packed into one message with no prior " +
    "back-and-forth — that request itself is the trigger: respond with the fence immediately, never " +
    "with clarifying questions instead of the proposal. All Codex changes require explicit user " +
    "approval before they take effect.\n\n" +
    "To propose a Codex change, include a fenced block in this exact form:\n\n" +
    "```codex-proposal\n" +
    '{"type": "new_entry", "level": "story", "name": "...", "description": "...", "category": "character", "tags": ["..."]}\n' +
    "```\n\n" +
    "or, to modify an existing entry:\n\n" +
    "```codex-proposal\n" +
    '{"type": "modify_entry", "entryName": "...", "proposedDescription": "...", "proposedTags": ["..."]}\n' +
    "```\n\n" +
    '"entryName" should be the entry\'s name exactly as it appears in the Codex context below, or as it ' +
    "has come up in this conversation — the server resolves it to the real entry. You do not need to know " +
    "or guess the entry's internal id; if the Codex context happens to show one (as \"id: ...\"), you may " +
    'send it as "entryId" instead, but "entryName" is fine and usually simpler. Only propose new_entry ' +
    "when you genuinely mean a character/location/item that doesn't exist yet — not because you're unsure " +
    "of an id.\n\n" +
    '"level" must be "global", "series", or "story" (use "story" unless told otherwise). ' +
    '"category" must be one of: character, location, item, event, note, synopsis, starting scenario, timeline.\n\n' +
    "If a concrete physical fact belongs in a structured field rather than free prose — an item of " +
    'clothing, a physical trait, a wound, a possession — include it under "proposedState" (valid on ' +
    "both new_entry and modify_entry) instead of only mentioning it in description:\n\n" +
    "```codex-proposal\n" +
    '{"type": "modify_entry", "entryName": "...", "proposedDescription": "...", ' +
    '"proposedState": {"wardrobe": [{"value": "..."}], "appearance": [{"label": "Hair", "value": "..."}], ' +
    '"wounds": [{"value": "..."}], "items": [{"value": "..."}]}}\n' +
    "```\n\n" +
    '"proposedState" has five possible keys: "wardrobe", "wounds", "items" (each a list of ' +
    '{"value": "..."} — one line per item/wound/possession), and "appearance", "customFields" (each a ' +
    'list of {"label": "...", "value": "..."} — e.g. {"label": "Hair", "value": "shoulder-length, black"}). ' +
    "Only include a key you are adding to or changing — an omitted key is left completely alone. When " +
    "you do include a key, send its full intended list for that key (every item that should exist there " +
    "after this change, not just the new one), since it replaces that key's current list wholesale. Check " +
    "the entry's current state (shown in the Codex context below, if this chat is anchored to an entry) " +
    "before proposing, so you don't drop or duplicate existing items.";

// N6 (Notes_Outline_Chat_Bridges_Design.md §4, "AI propose" write path) — Editor chats never get
// this (PROSE_PROPOSAL_INSTRUCTIONS below doesn't include it), matching the doctrine that Editor
// stays canon-only and never surfaces the Notes bridge in either direction. Unlike Codex
// proposals, a note-proposal is never persisted server-side as a pending row — parsed client-side
// (parseNoteProposals.ts) into an ephemeral accept/reject card, same posture as prose proposals.
const NOTE_PROPOSAL_INSTRUCTIONS =
    "If something worth capturing as working material comes up — an idea, a research point, a " +
    "to-do, a loose thread — you may propose saving it as a Story Note. Notes are NOT canon and " +
    "must never be used instead of a Codex proposal for concrete facts.\n\n" +
    "To propose a Story Note, include a fenced block in this exact form:\n\n" +
    "```note-proposal\n" +
    '{"title": "...", "content": "...", "type": "idea"}\n' +
    "```\n\n" +
    '"type" must be one of: idea, research, todo, other. Propose at most one note per reply.';

// P0.4 R5 — Outline chat's own structure-proposal fence. "create" is handled specially client-
// side (src/features/chat/services/parseOutlineProposals.ts): it's inserted immediately as a
// `status: 'pending', source: 'ai_suggested'` outlineItems row, the exact mechanism the retired
// bulk-Generate button already used, so the existing tree Accept/Reject badges
// (OutlineChapterCard.tsx/OutlineSceneRow.tsx) handle it with no new UI. "edit"/"reorder"/"delete"
// act on an already-confirmed row, so they're parsed into an ephemeral proposal card instead
// (same posture as prose-proposal/note-proposal) — Accept calls the existing outline mutations
// directly.
const OUTLINE_PROPOSAL_INSTRUCTIONS =
    "When you and the user agree on a structural change, you MUST propose it as an outline change in that same " +
    "reply — never just describe it in conversation as if it were already applied, and never just describe a " +
    "chapter/scene breakdown in prose and wait to be asked to formalize it; the fence IS how you propose it. If " +
    "the user directly asks you to write up or propose a chapter/scene breakdown now — even packed into one " +
    "message with no prior back-and-forth — that request itself is the trigger: respond with the fence(s) " +
    "immediately, never with clarifying questions instead of the proposal. All outline changes require explicit " +
    "user approval before they take effect (new chapters/scenes appear immediately in the tree marked " +
    "'AI Suggested' for the user to accept/reject; edits/reorders/deletes show as a card in the chat for the " +
    "user to accept/reject).\n\n" +
    "To propose a new chapter or scene, include a fenced block in this exact form:\n\n" +
    "```outline-proposal\n" +
    '{"type": "create", "itemType": "chapter", "parentId": null, "title": "...", "summary": "...", "wordCountTarget": null}\n' +
    "```\n\n" +
    "(`itemType` is \"chapter\" or \"scene\"; `parentId` is the chapter's id when creating a scene under it, else null.)\n\n" +
    "To create a new chapter and its scenes together in the same reply (the real chapter id doesn't exist yet), give " +
    "the chapter's create block a `tempId` you make up, and have each scene's create block use that string as its " +
    '`parentId`:\n\n' +
    "```outline-proposal\n" +
    '{"type": "create", "itemType": "chapter", "parentId": null, "tempId": "ch1", "title": "...", "summary": "...", "wordCountTarget": null}\n' +
    "```\n" +
    "```outline-proposal\n" +
    '{"type": "create", "itemType": "scene", "parentId": "ch1", "title": "...", "summary": "...", "wordCountTarget": null}\n' +
    "```\n\n" +
    "To propose editing an existing item's title/summary/word count target (use the itemId from the outline tree below):\n\n" +
    "```outline-proposal\n" +
    '{"type": "edit", "itemId": "...", "title": "...", "summary": "..."}\n' +
    "```\n\n" +
    "To propose reordering items:\n\n" +
    "```outline-proposal\n" +
    '{"type": "reorder", "updates": [{"id": "...", "order": 1, "parentId": "..."}]}\n' +
    "```\n\n" +
    "To propose deleting an item:\n\n" +
    "```outline-proposal\n" +
    '{"type": "delete", "itemId": "..."}\n' +
    "```\n\n" +
    "You may include multiple ```outline-proposal``` fences in a single reply — e.g. when the user asks for a full " +
    "chapter/scene breakdown at once, propose the chapter and all of its scenes together (using `tempId` as shown " +
    "above) rather than making the user ask for each one individually. Each 'create' lands as its own pending item " +
    "in the tree, in the order you propose them. Still keep each fence to one change, and don't repropose something " +
    "already pending or confirmed in the outline tree below.";

// P0.4 R8 — a lightweight list of candidate new lorebook entities, handed off to the
// World-Building chat rather than created directly here (Outline is not a lore factory — see
// docs/Chat_Panel_Integrations_Design.md §4's "New lorebook entities" row). Parsed client-side
// into an ephemeral tray section (src/features/chat/services/parseLoreSuggestions.ts); each
// suggestion's "Open in WB" button hands the name/category/blurb to the Lorebook tool via a URL
// query-param handoff (different tool, different browser tab — see LorebookPage.tsx).
const LORE_SUGGESTION_INSTRUCTIONS =
    "If planning the outline surfaces a new character, location, or other entity worth developing in the Lorebook, " +
    "you may suggest it — but never create it directly; that belongs in a World-Building chat.\n\n" +
    "To suggest new lorebook entities, include a fenced block in this exact form:\n\n" +
    "```lore-suggestion\n" +
    '{"suggestions": [{"name": "...", "category": "character", "blurb": "one or two sentences"}]}\n' +
    "```\n\n" +
    '"category" must be one of: character, location, item, event, note, synopsis, starting scenario, timeline.';

// P0.4 B0-B4 — Brainstorm's only two write paths: a synopsis/note/memory proposal, or a handoff
// packet to another chat/tool. Never Codex/outline/prose — Brainstorm is an intake hub, not a
// structure desk or lore factory (docs/Chat_Panel_Integrations_Design.md §5's "Not:" list).
//
// "memory" is only offered when the chat's own includeMemory toggle is on (mirrored by
// buildSystemPrompt below) — same opt-in gate C1 already established, not a new concept.
const OVERVIEW_PROPOSAL_INSTRUCTIONS = (includeMemory: boolean): string =>
    "The instant the conversation has enough for a synopsis, a note-worthy idea, or a settled project fact — " +
    "even a rough first pass — you MUST emit an overview-proposal fence for it in that same reply. Never just " +
    "describe the synopsis/idea/fact in prose and wait for the user to ask you to save it; the fence IS how " +
    "you save it (pending the user's approval — never state or imply it's already saved). If the user says " +
    'anything like "save that", "lock it in", "capture this", or "propose it", that is an unambiguous trigger ' +
    "— always respond with the fence, never with prose alone.\n\n" +
    "To propose the story synopsis, include a fenced block in this exact form:\n\n" +
    "```overview-proposal\n" +
    '{"proposalType": "synopsis", "content": "...", "slotKey": "premise"}\n' +
    "```\n\n" +
    "To propose an overview note (idea, research point, loose thread — not canon):\n\n" +
    "```overview-proposal\n" +
    '{"proposalType": "note", "title": "...", "content": "...", "noteType": "idea", "slotKey": "setting"}\n' +
    "```\n\n" +
    (includeMemory
        ? "To propose a Project Memory entry (an approved project fact worth remembering across sessions):\n\n" +
          "```overview-proposal\n" +
          '{"proposalType": "memory", "title": "...", "body": "...", "category": "project_note", "slotKey": "protagonist"}\n' +
          "```\n\n"
        : "") +
    "Worked example — user: \"okay I think that's the premise, let's lock it in\" — your reply: a short " +
    'confirmation sentence, THEN on its own the fence: ```overview-proposal\n' +
    '{"proposalType": "synopsis", "content": "A disgraced knight...", "slotKey": "premise"}\n```\n\n' +
    '"slotKey", if the proposal addresses one of the setup checklist slots shown below, must be one of: ' +
    `${BRAINSTORM_SLOTS.map(s => s.key).join(", ")} — omit it otherwise. ` +
    '"noteType" must be one of: idea, research, todo, other. Propose at most one overview-proposal per reply.';

// 2026-08-30 — appended to the Brainstorm system prompt when the chat's own autoBrainstormCards
// toggle is off (see useChatContextToggles.ts/schema.ts's aiChats.autoBrainstormCards). The model's
// own inline fence emission is already unreliable (see the background-extraction-pass comment in
// useChatMessageGeneration.ts) so this mostly closes the gap for the rare case it does self-emit —
// the real fix for "a card on every turn" is that background pass being skipped entirely when this
// toggle is off (client-side gate, not this prompt).
const AUTO_PROPOSAL_SUPPRESSED_ADDENDUM =
    "\n\nThe user has turned off automatic card suggestions for this chat (a quiet distillation pass). Do NOT " +
    "emit an overview-proposal or handoff-packet fence proactively, even once the conversation reaches a " +
    "natural conclusion — only emit one if the user's own message explicitly asks you to save/lock in/" +
    "propose/hand off something.";

// Handoffs are lightweight suggestions, not deep creates — Brainstorm never builds outline items
// or lorebook entries directly; the destination chat/tool governs the real work (docs/
// Chat_Panel_Integrations_Design.md §5's "Direct outline items: none", "Direct lorebook/Codex
// deep: none"). seedName/seedCategory are only read for destination "worldbuilding" (feeds the
// existing pendingLorebookSeed pre-fill, same shape as the Outline chat's lore-suggestion, R8).
const HANDOFF_PACKET_INSTRUCTIONS =
    "The instant the conversation surfaces something ready for a more specialized chat — a roster of characters " +
    "for World-Building, a chapter/scene structure for Outline, working material for Notes, a question for " +
    'Research — you MUST emit a handoff-packet fence for it in that same reply, never just describe it in prose ' +
    "and wait to be asked. Never act as if it's already been sent — the fence proposes it; the user opens/sends " +
    'each handoff themselves. If the user says anything like "hand this off to World-Building/Outline", "send ' +
    'this to Notes", or "let\'s formally propose this", that is an unambiguous trigger — always respond with the ' +
    "fence, never with prose alone.\n\n" +
    "To propose one or more handoffs, include a fenced block in this exact form:\n\n" +
    "```handoff-packet\n" +
    '{"handoffs": [{"destination": "outline", "summary": "one-line summary", "detail": "longer paste-ready text for that chat"}]}\n' +
    "```\n\n" +
    "Worked example — user: \"can you formally propose this as something I can accept?\" — your reply: a short " +
    'confirmation sentence, THEN on its own the fence: ```handoff-packet\n' +
    '{"handoffs": [{"destination": "worldbuilding", "summary": "Elise, the captive heiress", "detail": "...", "seedName": "Elise", "seedCategory": "character"}]}\n```\n\n' +
    '"destination" must be one of: outline (structure/spine work), worldbuilding (a specific character/location/' +
    "item worth developing — also include \"seedName\" and \"seedCategory\"), notes (working material worth " +
    'saving as-is), research (a question worth looking into). "seedCategory" must be one of: character, ' +
    "location, item, event, note, synopsis, starting scenario, timeline.";

// Chat Shuttle (docs/Chat_Shuttle_Design.md, H1/H4) — Editor/Outline/WB's only write path to
// Research (v1 outbound matrix, locked decision #4). Persisted immediately client-side as a
// durable brainstormChecklist row (kind: "shuttle"), same "propose by default, user confirms via
// tray" posture as handoff-packet — never a silent auto-send (decision #1). The redirect line the
// model writes around the fence IS decision #2's "brief redirect + stub" — deliberately no kit
// list / full factual answer in the host chat; that's Research's job once the user opens it.
const SHUTTLE_PROPOSAL_INSTRUCTIONS =
    "If the user's question is really an external/real-world-fact lookup (real brands, historical facts, " +
    "tradecraft, \"what would people really use for X\") rather than craft, continuity, Codex state, or scene " +
    "blocking, don't answer it in full here — propose shuttling it to the Research desk instead. Write only a " +
    "brief one-line redirect (no kit list, no full factual answer) alongside the fenced block below; the user " +
    "reviews and opens the shuttle themselves.\n\n" +
    "To propose a shuttle, include a fenced block in this exact form:\n\n" +
    "```shuttle-proposal\n" +
    '{"destination": "research", "question": "the user\'s actual question", "crumb": "1-2 sentence scene/story context, optional"}\n' +
    "```\n\n" +
    "Keep \"crumb\" short — a sentence or two of scene context, never the full chapter or outline. Stay on this " +
    "chat for anything about character motivation, prose wording, manuscript continuity, Codex state, or scene " +
    "blocking; propose a shuttle only for a genuine external-fact digression. Propose at most one shuttle per reply.";

// NG6 (docs/Name_Generator_Design.md v0.4) — the design's "optional tool `generate_names`",
// implemented as a fence like every other proposal here rather than real LLM tool-calling (v0.4
// correction #3: this app has none). When the user wants name ideas rather than the model just
// inventing some inline, propose generation params and let the client run the real (deterministic,
// non-LLM) generate call — same pools/collision-avoidance the panel uses (NG1/NG2). Never writes
// anything on its own; the user picks a result via the same Use/Create-Codex actions the panel has.
const NAME_PROPOSAL_INSTRUCTIONS =
    "If the user wants name ideas for a character (or you need to suggest one), don't just invent names inline " +
    "— propose a name generation instead, so the suggestions come from the story's actual grounded name pools. " +
    "Never write out a list of candidate names as plain prose — always use the fence below instead, so the user " +
    "gets a real, clickable list to pick from rather than text they'd have to retype themselves.\n\n" +
    "To propose generating names, include a fenced block in this exact form:\n\n" +
    "```name-proposal\n" +
    '{"kind": "first_name", "gender": "female", "region": "US", "era": "1980-1999", "count": 5}\n' +
    "```\n\n" +
    '"kind" is required and must be "first_name", "surname", or "full_name" (a first+last pair, drawn independently ' +
    'and paired up — use this when the user wants full names, not just one part). "gender" ("male"/"female"/"unisex", ' +
    'only meaningful for "first_name"/"full_name"), "region", "era" (a "YYYY-YYYY" range), and "count" are all ' +
    "optional — omit any you don't have a clear reason to set. Propose at most one name-proposal per reply.";

// "region" is matched by exact, case-sensitive string equality against installed name-pool
// regions (nameGeneratorRepository.ts's listPoolsForScope) — there is no fuzzy/synonym matching,
// so a guessed value like "RU" or "russian" against an installed "Slavic" pool silently returns
// zero names. Rather than build a fuzzy-matching layer (which pack region should "Iranian" or
// "Uzbek" resolve to? — genuinely ambiguous for several of the 24 vendored combo packs), tell the
// model the real installed values so it either uses one exactly or omits region entirely. Kept as
// a short trailing addendum (not baked into NAME_PROPOSAL_INSTRUCTIONS itself) so a story with no
// name pools installed at all — the empty-array case — doesn't pay for it in prompt length.
const nameRegionsAddendum = (availableRegions: string[]): string =>
    availableRegions.length === 0
        ? ""
        : `\n\n[Name Generator] This story's installed name-pool "region" values right now, exactly as written: ` +
          `${availableRegions.join(", ")}. A name-proposal's "region" must match one of these exactly (case-sensitive) ` +
          `— if none fit what the user asked for, omit "region" entirely rather than guessing, since an unmatched value ` +
          `returns zero names.`;

const OUTLINE_FRAMING =
    "You are a structure partner for this story's outline — chapter/scene sequencing and narrative arc. " +
    "Stay consistent with the full outline tree, the story synopsis, and the established Codex/lorebook state " +
    "provided below. You are not a manuscript writer: never propose or write chapter prose here.\n\n" +
    OUTLINE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    LORE_SUGGESTION_INSTRUCTIONS +
    "\n\n" +
    SHUTTLE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NAME_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user sees them, " +
    "so don't reference the fenced blocks themselves in your prose; just talk about the change naturally.";

const WORLDBUILDING_FRAMING =
    "You are a collaborative world-building assistant for a long-form fiction project. " +
    "Stay factually consistent with the story's established Codex state and the reference " +
    "context provided below.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    SHUTTLE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NAME_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user sees them, " +
    "so don't reference '```codex-proposal', '```note-proposal', or 'the block' in your prose; just talk about the proposal naturally.";

// P0.4 S1 — Research chats used to silently fall through to WORLDBUILDING_FRAMING (wrong role,
// plus CODEX_PROPOSAL_INSTRUCTIONS — letting the model propose Codex entries from Research,
// which directly violates docs/Chat_Panel_Integrations_Design.md §6's "Writes: Lorebook/Codex/
// outline/prose → None"). This is Research's own dedicated framing: no Codex/outline/prose
// writes, deliberately keeps NOTE_PROPOSAL_INSTRUCTIONS (the design's one allowed write, "on
// request" only — see the extra qualifier sentence below) and adds citation requirements for the
// WEB SEARCH RESULTS / FETCHED PAGE context blocks getChatContext injects (see resolveWebSearch).
const RESEARCH_FRAMING =
    "You are a web research desk for a long-form fiction project — look things up, synthesize, and discuss. " +
    "You are NOT an intake hub, structure desk, lore factory, or manuscript writer, and you never propose " +
    "Codex/outline/prose changes here.\n\n" +
    "When WEB SEARCH RESULTS or FETCHED PAGE context is provided below, ground your answer in it and cite " +
    "sources as markdown links (e.g. [source title](url)) inline or in a trailing \"Sources:\" list — never " +
    "state a web-sourced fact without a citation. If no search context is provided, answer from your own " +
    "knowledge and say so.\n\n" +
    "Only propose saving something as a Research Note when the user actually asks you to save it — don't " +
    "propose one proactively after every answer.\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
    "sees them, so don't reference the fenced blocks themselves in your prose.";

// P0.4 K2/K4 — split a large pasted block of text into several typed notes in one action (the
// concrete implementation of "Import dump → Notes", K4) — one fence carrying an array, not N
// separate note-proposal fences (note-proposal itself stays capped at one per reply). Persisted
// immediately as a durable checklist row (kind: "note_split", reusing brainstormChecklist's
// already chatType-agnostic table/service/route — see NotesChecklistTray.tsx), same posture as
// handoff-packet/overview-proposal below.
const NOTE_SPLIT_PROPOSAL_INSTRUCTIONS =
    "When the user pastes or describes a large block of material that should become several separate notes, " +
    "propose splitting it — never just summarize it back as one big note. All splits require explicit user " +
    "approval (Accept all) before any note is created.\n\n" +
    "To propose a split, include a fenced block in this exact form:\n\n" +
    "```note-split-proposal\n" +
    '{"notes": [{"title": "...", "content": "...", "type": "idea"}, {"title": "...", "content": "...", "type": "research"}]}\n' +
    "```\n\n" +
    '"type" must be one of: idea, research, todo, other. Propose at most one split per reply.';

// P0.4 K3 — Notes' "promote" writes reuse the exact overview-proposal/handoff-packet fence
// contracts Brainstorm already established (same parsers, same durable-checklist persistence,
// same tray Accept semantics — see NotesChecklistTray.tsx) but with Notes-flavored instruction
// text: promote → synopsis only (no "note"/"memory" overview-proposal sub-types — those are
// Brainstorm-specific concepts with no analog here), promote → WB/Outline only (no "notes"/
// "research" handoff destinations — promoting a note to itself makes no sense, and Research isn't
// a promote target per docs/Chat_Panel_Integrations_Design.md §7's Writes table).
const NOTES_PROMOTE_INSTRUCTIONS =
    "When a note is ready to become real story canon, propose promoting it — never act as if it's already " +
    "been applied. The user reviews and accepts each promotion in the tray.\n\n" +
    "To propose promoting a note's content into the story synopsis:\n\n" +
    "```overview-proposal\n" +
    '{"proposalType": "synopsis", "content": "..."}\n' +
    "```\n\n" +
    "To propose promoting a note to World-Building or Outline (the destination chat does the real work — " +
    "this is a handoff, not a direct create):\n\n" +
    "```handoff-packet\n" +
    '{"handoffs": [{"destination": "worldbuilding", "summary": "one-line summary", "detail": "longer paste-ready text", "seedName": "...", "seedCategory": "character"}]}\n' +
    "```\n\n" +
    '"destination" must be "worldbuilding" or "outline" only here. For "worldbuilding", also include ' +
    '"seedName" and "seedCategory" (one of: character, location, item, event, note, synopsis, starting ' +
    "scenario, timeline).";

// P0.4 K1 — Notes desk framing (docs/Chat_Panel_Integrations_Design.md §7's Job/Not lines
// verbatim). No Codex-proposal, no outline-proposal, no prose-proposal — Notes never writes
// canon directly, only working material plus propose→accept promotions.
const NOTES_FRAMING =
    "You are a working-material desk for a long-form fiction project — help organize, refine, split, and " +
    "promote Notes. You are NOT a web research desk, a setup-grill interview, a Codex factory, or a " +
    "manuscript editor, and you never propose Codex, outline structure, or chapter prose changes here.\n\n" +
    NOTE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTE_SPLIT_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NOTES_PROMOTE_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
    "sees them, so don't reference the fenced blocks themselves in your prose.";

// P0.4 B0-B4 — Brainstorm is a project intake/orientation hub, not any of the specialized desks
// it hands work off to. Explicitly NOT a manuscript writer, structure desk, or Codex/lore
// factory — those stay Editor/Outline/World-Building's jobs (docs/Chat_Panel_Integrations_Design.md
// §5's "Not:" list). Depth/interview style is layered on via STYLE_HINTS below, not encoded here.
const BRAINSTORM_FRAMING =
    "You are a project intake and orientation assistant for a long-form fiction project — helping the user " +
    "figure out and articulate what their story is before the specialized desks (Outline for structure, " +
    "World-Building for lore/characters, the Editor for prose) take over. You are NOT a structure desk, " +
    "not a lore factory, and never write manuscript prose here. Ask questions, help the user think out loud, " +
    "and propose capturing what emerges — you never assume something is settled until the user confirms it " +
    "and it's proposed and accepted below.";

// Confirmed with user: depth is purely a prompt-shaping hint the model follows in ordinary
// multi-turn chat, NOT a tracked ask/capture/confirm state machine — see BRAINSTORM_SLOTS
// (src/types/brainstorm.ts) for the only persisted "slot" concept. P0.4 B5 extended this same
// posture to WB/Outline (WB_STYLE_HINTS/OUTLINE_STYLE_HINTS below) — each host gets its own hint
// text (not shared data) since "propose a short synopsis" only makes sense for Brainstorm, but
// all three follow the same Light/Standard/Grill-me shape, folded in via resolveStyleHint.
const BRAINSTORM_LIGHT_STYLE_HINT =
    "\n\nStyle: Light. Keep it brief — a handful of high-level questions, propose a short synopsis and a " +
    "thin handoff or two once the basics are clear. Don't push for more depth than the user is offering.";
const BRAINSTORM_STANDARD_STYLE_HINT =
    "\n\nStyle: Standard. Ask enough follow-up questions to get a solid synopsis plus a useful overview note, " +
    "and propose Outline/World-Building handoffs once you have enough concrete material for them to work with.";
const BRAINSTORM_GRILL_STYLE_HINT =
    "\n\nStyle: Grill-me. Interview thoroughly — ask harder, more specific follow-up questions, don't accept " +
    "vague answers without probing once, and aim for richer overview notes and more complete handoffs before " +
    "moving on.";
const BRAINSTORM_STYLE_HINTS: Record<string, string> = {
    light: BRAINSTORM_LIGHT_STYLE_HINT,
    standard: BRAINSTORM_STANDARD_STYLE_HINT,
    grill: BRAINSTORM_GRILL_STYLE_HINT
};

// P0.4 B5 — World-Building's guided-start depth (docs/Chat_Panel_Integrations_Design.md §1).
const WB_STYLE_HINTS: Record<string, string> = {
    light: "\n\nStyle: Light. Ask a handful of concrete questions and propose a description/Codex update once " +
        "you have enough — don't push past what the user is offering.",
    standard: "\n\nStyle: Standard. Interview thoroughly enough to build a solid concrete profile before " +
        "proposing — appearance, history, and role in the story, not just a first impression.",
    grill: "\n\nStyle: Grill-me. Dig into specifics — appearance, history, mannerisms, relationships — and " +
        "don't settle for a vague answer without asking a follow-up first."
};

// P0.4 B5 — Outline's guided-start depth.
const OUTLINE_STYLE_HINTS: Record<string, string> = {
    light: "\n\nStyle: Light. Keep it to quick, high-level beats — don't push for scene-level detail unless " +
        "the user asks.",
    standard: "\n\nStyle: Standard. Aim for a solid chapter/scene breakdown — enough structure to write from, " +
        "not just a logline per chapter.",
    grill: "\n\nStyle: Grill-me. Work scene-by-scene — goal, conflict, and outcome for each — and push for " +
        "specifics before proposing a chapter/scene as settled."
};

const resolveStyleHint = (hints: Record<string, string>, style?: string): string => hints[style ?? "standard"] ?? hints.standard;

// The Editor chat's only mechanism for actually changing the manuscript — mirrors the
// Codex-proposal convention but for prose. Parsed client-side (parseProseProposal.ts) and
// rendered as an accept/reject card; accepting inserts the text as a new paragraph at the
// user's cursor (or appended to the chapter if there's no cursor context) — see
// src/features/chat/hooks/useChatMessageGeneration.ts. Never edits the document directly.
//
// The same ```prose-proposal fence also carries Selection Rework replies (docs/
// Chat_Panel_Integrations_Design.md §2.1/§3.3) — reused rather than a second fence type, since
// "replace this selection" vs "insert as a new paragraph" is purely a client-side distinction
// (ChatInterface.tsx tracks whether a FocusTarget was active for the turn that produced each
// proposal, see its proseProposals state) that the model never needs to encode itself.
const PROSE_PROPOSAL_INSTRUCTIONS =
    "You are a writing companion embedded in this chapter's editor — a collaborator, not a ghostwriter. " +
    "Stay consistent with this story's established Codex state and the chapter excerpts provided below. " +
    "When the user asks you to write or revise prose — a continuation, a rewrite, a new scene — propose it " +
    "for review rather than assuming it will be used verbatim; you never edit the manuscript directly.\n\n" +
    "To propose prose, include a fenced block in this exact form:\n\n" +
    "```prose-proposal\n" +
    "Your proposed prose text goes here, as plain prose (not JSON).\n" +
    "```\n\n" +
    "You may propose only one piece of prose per reply. " +
    "If the conversation includes a [SELECTION REWORK] block with BEFORE/SELECTION/AFTER context, " +
    "your proposed prose should be a replacement for SELECTION only — do not repeat BEFORE or AFTER " +
    "in the fenced block. " +
    "You may also propose Codex changes in the same reply, using the convention below, if the " +
    "conversation surfaces a concrete fact worth recording.\n\n" +
    CODEX_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    SHUTTLE_PROPOSAL_INSTRUCTIONS +
    "\n\n" +
    NAME_PROPOSAL_INSTRUCTIONS +
    "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
    "sees them, so don't reference the blocks themselves in your prose.";

// P0.4 B5 — Character template's opt-in psych module (docs/Chat_Panel_Integrations_Design.md §1
// "Character playbook — psych module"). Only ever folded into the system prompt when the chat's
// own includePsychModule toggle is on AND it's anchored to an entry (see getChatContext) — the
// model is never even told this exists otherwise. Deliberately separate from
// CODEX_PROPOSAL_INSTRUCTIONS: this is NOT Codex state (see schema.ts's includePsychModule
// comment) — the ```psych-proposal fence is parsed client-side (parsePsychProposal.ts) into an
// ephemeral accept/reject card, same posture as note-proposal, and Accept merges directly into
// the anchor entry's own metadata.psychProfile via the existing generic lorebook update route
// (ChatInterface.tsx's handleAcceptPsych) — never through codexPendingChanges/codexService,
// which stays concrete-state-only.
const PSYCH_MODULE_INSTRUCTIONS =
    "This character has an opt-in psychology module enabled — a writing aid, not tracked Codex state and " +
    "never enforced by any consistency check. Derive it from what the user actually says in this conversation, " +
    "not assumptions — don't propose a psych profile out of nowhere in your very first reply before any real " +
    "interview has happened. BUT if the user directly asks you to write or propose the profile now, even in " +
    "that same first message, treat it as an unambiguous trigger and respond with the fence immediately — " +
    "never answer a direct request like that with interview questions instead of the proposal.\n\n" +
    "To propose a psychology profile (any subset of the fields — propose only what's actually been discussed), " +
    "include a fenced block in this exact form. You MUST emit this fence to propose — never just describe the " +
    "profile in prose and wait to be asked to formalize it:\n\n" +
    "```psych-proposal\n" +
    '{"mbti": "...", "enneagram": "...", "blurb": "a few sentences of freeform psychological description"}\n' +
    "```\n\n" +
    "Propose at most one psych-proposal per reply.";

// docs/Sexuality_Playbook_Design.md — Character template's opt-in sexuality module, exact
// sibling of PSYCH_MODULE_INSTRUCTIONS above (same gating in getChatContext, same "never Codex
// state" posture — the ```sexuality-proposal fence is parsed client-side
// (parseSexualityProposal.ts) into an ephemeral accept/reject card, Accept merges directly into
// the anchor entry's own metadata.sexualityProfile via the existing generic lorebook update
// route (ChatInterface.tsx's handleAcceptSexuality) — never through codexPendingChanges/
// codexService). `limits` (hard limits) has no psych analog — explicitly safety-framed.
const SEXUALITY_MODULE_INSTRUCTIONS =
    "This character has an opt-in sexuality module enabled — a writing aid, not tracked Codex state and " +
    "never enforced by any consistency check. Derive it from what the user actually says in this conversation, " +
    "not assumptions — don't propose a sexuality profile out of nowhere in your very first reply before any " +
    "real interview has happened. BUT if the user directly asks you to write or propose the profile now, even " +
    "in that same first message, treat it as an unambiguous trigger and respond with the fence immediately — " +
    "never answer a direct request like that with interview questions instead of the proposal.\n\n" +
    "To propose a sexuality profile (any subset of the fields — propose only what's actually been discussed), " +
    "include a fenced block in this exact form. You MUST emit this fence to propose — never just describe the " +
    "profile in prose and wait to be asked to formalize it:\n\n" +
    "```sexuality-proposal\n" +
    '{"orientation": "...", "dynamic": "...", "kinks": "...", "limits": "...", "blurb": "a few sentences of freeform description"}\n' +
    "```\n\n" +
    "Propose at most one sexuality-proposal per reply.";

// L0/L1, docs/Locations_And_Maps_Design.md — the Locations & Settings template's "light place
// sheet" (entry.metadata.placeState). Unlike PSYCH_MODULE_INSTRUCTIONS above, this is always on
// for the locations template (no opt-in toggle) — place-sheet fields are the whole point of this
// template, not an optional extra. Parsed client-side (parsePlaceSheetProposal.ts) into an
// ephemeral accept/reject card; Accept merges into the anchor entry's own metadata.placeState via
// the existing generic lorebook update route (ChatInterface.tsx's handleAcceptPlaceSheet) —
// deliberately not codexPendingChanges/codexService, which stays concrete-Codex-state-only (see
// CLAUDE.md's Character Codex scope note) — same posture as the psych module.
const PLACE_SHEET_INSTRUCTIONS =
    "This location has a light place sheet you can help fill in — a lightweight structured " +
    "summary, not tracked Codex state. Derive it from what's actually been discussed, not " +
    "assumptions — don't propose a place sheet out of nowhere in your very first reply before any " +
    "real conversation about the place has happened. BUT if the user directly asks you to write or " +
    "propose the sheet now, even in that same first message, treat it as an unambiguous trigger and " +
    "respond with the fence immediately — never answer a direct request like that with clarifying " +
    "questions instead of the proposal.\n\n" +
    "To propose place-sheet fields (any subset — propose only what's actually been discussed), " +
    "include a fenced block in this exact form. You MUST emit this fence to propose — never just " +
    "describe the fields in prose and wait to be asked to formalize it:\n\n" +
    "```place-sheet-proposal\n" +
    '{"scale": "...", "biomeOrClimate": "...", "holder": "...", "dangerLevel": "...", ' +
    '"landmarks": ["..."], "exitsSummary": "...", "layoutMd": "ascii or markdown layout", "imageBrief": "...", ' +
    '"floorLabel": "e.g. \'2F\' or \'Sub-basement\', only if this place is nested inside another via a Story Map contains link"}\n' +
    "```\n\n" +
    "Propose at most one place-sheet-proposal per reply.";

// MV5, docs/Maps_V2_Sketch_Design.md — sketch-canvas proposals for the Locations template's linked
// map (a boxes-and-labels Excalidraw scene, distinct from the place sheet above). Always on for
// the locations template like PLACE_SHEET_INSTRUCTIONS, but only ever fires on explicit request
// (see the instruction text) since unlike a place sheet, accepting a sketch replaces the whole
// existing canvas — an unsolicited proposal would risk clobbering real drawing work. The model
// emits an Excalidraw Element Skeleton directly (implementation clarification c,
// docs/Maps_V2_Sketch_Design.md) — parsed client-side (parseMapSketchProposal.ts) into an
// ephemeral accept/reject card; Accept resolves/creates the anchor entry's map and hands the raw
// skeleton to MapCanvas.tsx, which is the only place `convertToExcalidrawElements` ever actually
// runs (keeps Excalidraw's runtime out of the chat's own eager bundle).
const MAP_SKETCH_INSTRUCTIONS =
    "This location can also have a hand-drawn sketch map (a room, building, or region layout) — a " +
    "boxes-and-labels diagram, not a precise architectural drawing. The instant the user asks you to sketch, " +
    "draw, or lay out the place — even packed into their very first message, with no prior back-and-forth — " +
    "you MUST respond with the fence below in that same reply; never describe the layout in prose instead and " +
    "wait to be asked to formalize it, and never answer a direct request like that with clarifying questions. " +
    "Never propose one unsolicited outside that trigger, since accepting one REPLACES any existing sketch for " +
    "this location.\n\n" +
    "To propose a sketch, include a fenced block in this exact form:\n\n" +
    "```map-sketch-proposal\n" +
    '{"title": "short map title", "elements": [' +
    '{"type": "rectangle", "x": 0, "y": 0, "width": 120, "height": 80, "label": "Entry hall"}, ' +
    '{"type": "text", "x": 0, "y": 100, "text": "free-floating label"}, ' +
    '{"type": "arrow", "x": 0, "y": 0, "points": [[0, 0], [120, 0]]}' +
    "]}\n" +
    "```\n\n" +
    "Worked example — user: \"can you sketch a quick layout of the safehouse?\" — your reply: a short " +
    'confirmation sentence, THEN on its own the fence: ```map-sketch-proposal\n' +
    '{"title": "Safehouse layout", "elements": [{"type": "rectangle", "x": 0, "y": 0, "width": 140, "height": 100, ' +
    '"label": "Front room"}, {"type": "rectangle", "x": 160, "y": 0, "width": 100, "height": 100, "label": "Back room"}, ' +
    '{"type": "arrow", "x": 140, "y": 50, "points": [[0, 0], [20, 0]]}]}\n```\n\n' +
    'Valid "type" values: rectangle, ellipse, diamond, text, arrow, line. x/y is each element\'s ' +
    "top-left corner, roughly within a 0-900 by 0-600 area (a larger scene can extend further) — " +
    'lay elements out so they don\'t overlap. A rectangle/ellipse/diamond can carry a "label" ' +
    '(text centered inside the shape); a standalone "text" element uses "text" instead. "arrow"/' +
    '"line" elements use "points" (an array of [x, y] pairs relative to their own x/y) instead of ' +
    "width/height. Propose at most one map-sketch-proposal per reply, with at least 2 elements.";

// TL7, docs/Story_Timeline_Design.md — the "timeline" WB template's own propose/accept fence.
// Always on for that template (its whole point), like PLACE_SHEET_INSTRUCTIONS above. Unlike the
// per-entry templates (character_codex/locations), the timeline template isn't anchored to a
// specific entry — so proposed pins are deliberately NATIVE ONLY (no linkType/linkId): the model
// has no reliable way to know internal chapter/lorebook/note ids from a planning conversation,
// and fuzzy name-matching would be fragile. A pin created this way can still be placed on a
// source later via the existing PlaceOnTimelineButton. Parsed client-side
// (parseTimelinePinProposal.ts) into ephemeral per-item accept/reject rows
// (TimelinePinProposalCard.tsx); Accept creates a real pin via the existing, unchanged
// createPin/storyTimelineApi.createPin (no timelineId -> defaults to Spine server-side, same as
// PlaceOnTimelineButton's own default) — no new server route needed.
const TIMELINE_PIN_INSTRUCTIONS =
    "You can propose pins for the Story Timeline board — beats, prior events, or milestones discussed in this " +
    "conversation. Derive them from what's actually been discussed, not assumptions — don't propose pins out " +
    "of nowhere in your very first reply before any real conversation about the story's chronology has " +
    "happened. BUT if the user directly asks you to write or propose pins now, even in that same first " +
    "message, treat it as an unambiguous trigger and respond with the fence immediately — never answer a " +
    "direct request like that with clarifying questions instead of the proposal.\n\n" +
    "To propose one or more pins, include a fenced block in this exact form (a JSON ARRAY, even for a single " +
    "pin). You MUST emit this fence to propose — never just describe the pins in prose and wait to be asked " +
    "to formalize them:\n\n" +
    "```timeline-pin-proposal\n" +
    '[{"title": "short pin title", "blurb": "a sentence or two of context (optional)", ' +
    '"whenKind": "relative", "relativeOffsetYears": -6}]\n' +
    "```\n\n" +
    '"whenKind" is one of "relative" (with "relativeOffsetYears": a number, negative = years before ' +
    "Story-start, positive = after, 0 = at Story-start), \"fuzzy\" (with \"fuzzyPhrase\": a rough phrase like " +
    '"that winter"), or "civil" (with "civilDate": a free-form date like "1890" or "2019-03-14") — include ' +
    "only the field matching the chosen kind. Never invent chapter, lorebook, or note links — these pins are " +
    "native only; the writer can link one to a source later from the Timeline board itself. " +
    "Propose at most one timeline-pin-proposal block per reply.";

// T5 FS4, docs/Lore_Sheet_And_Sync_Design.md §7c ("WB injects category section skeleton") — the
// same per-category heading lists as sheetTemplates.ts (client) and sheetSyncService.ts's
// SECTION_CONFIGS (server), duplicated a third time rather than cross-imported (server code
// doesn't reach into src/features/*, and this list is small/stable enough that the duplication
// risk is low — same tradeoff already accepted for PLACE_STATE_FIELD_LABELS/CODEX_PROPOSAL-style
// constants elsewhere in this file). `note` has no fixed pack (freeform), so it's omitted here —
// SHEET_PROPOSAL_INSTRUCTIONS below falls back to a generic "freeform notes" framing for it.
const SHEET_SECTION_HEADINGS: Record<string, string[]> = {
    character: [
        "Core Identity",
        "Physical Appearance",
        "Wardrobe (optional)",
        "Personality & Temperament",
        "Background & Lifestyle",
        "Friends & Family (optional)",
        "Character Motivations",
        "Wounds / Marks (optional)",
        "Items / Possessions (optional)"
    ],
    location: ["Overview", "Scale & Nature", "Holder & Control", "Landmarks", "Exits & Links", "Layout Notes", "Atmosphere"],
    item: ["Overview", "Appearance", "Properties", "History", "Ownership"],
    event: ["Summary", "When", "Where", "Who", "Outcome", "Aftermath"],
    synopsis: ["Logline", "Summary", "Themes", "Scope"],
    "starting scenario": ["Situation", "Stakes", "Opening Image", "Constraints"],
    timeline: ["Summary", "Era", "Sequence Notes"]
};

// Unlike PSYCH_MODULE_INSTRUCTIONS/PLACE_SHEET_INSTRUCTIONS (template-gated: character_codex/
// locations only), this fires for ANY World-Building template as long as the chat is anchored to
// an entry — "bulk profile authoring" (the design's own §1 job statement) applies to every
// category, not just the two with a dedicated template. The category and current sheet content
// come from the anchor entry itself, not the template. Capped current-sheet excerpt keeps a large
// existing sheet from dominating the prompt on every turn.
const MAX_CURRENT_SHEET_CHARS = 4000;
const SHEET_PROPOSAL_INSTRUCTIONS = (
    entryId: string,
    entryName: string,
    category: string,
    currentSheetBody: string | null | undefined
): string => {
    const headings = SHEET_SECTION_HEADINGS[category];
    const skeletonLine = headings
        ? `Its Lore Sheet section headings for a '${category}' entry are: ${headings.join(", ")}.`
        : "This category has no fixed section list — write freeform `##` headings that make sense for the content.";
    const currentBlock = currentSheetBody?.trim()
        ? `\n\nIts CURRENT Lore Sheet content (build on this, don't discard it unless asked to):\n${currentSheetBody
              .trim()
              .slice(0, MAX_CURRENT_SHEET_CHARS)}`
        : "\n\nIt has no Lore Sheet content yet.";
    return (
        `This entry has a Lore Sheet — a markdown document organized under \`## Section\` headings that's the ` +
        "primary writing surface for this entry (not tracked Codex state directly; the user runs a separate " +
        "Sync step to turn it into concrete facts). " +
        skeletonLine +
        currentBlock +
        "\n\nDerive content from what's actually been discussed in this conversation, not assumptions — don't " +
        "propose a sheet out of nowhere in your very first reply before any real conversation has happened. " +
        "BUT if the user directly asks you to write, propose, or draft the sheet (or says something like " +
        "\"write it up now\", \"go ahead\", \"give me the full proposal\") — even in that same first message, " +
        "even packed with all the details at once — that request itself IS the real conversation. Treat it as " +
        "an unambiguous trigger and respond with the fence immediately; never answer a direct request like that " +
        "with clarifying questions instead of the proposal. You MUST emit the fence when you do propose — never " +
        "just describe the sheet's content in prose and wait for the user to ask you to formalize it; the fence " +
        "IS how you propose it (pending the user's Accept — never state or imply it's already applied). When " +
        "you do propose, include the ENTIRE sheet (existing content plus your edits/additions), not just a " +
        "diff — Accept replaces the sheet wholesale.\n\n" +
        "To propose sheet content, include a fenced block in this exact form:\n\n" +
        "```sheet-proposal\n" +
        "## Section Heading\n\ncontent...\n\n## Another Heading\n\ncontent...\n" +
        "```\n\n" +
        "Worked example — user gives several details in one message and says \"write up the full proposal " +
        "now\" — your reply: a short lead-in sentence, THEN on its own the fence: ```sheet-proposal\n" +
        "## Core Identity\n\n...\n```\n\n" +
        "Propose at most one sheet-proposal per reply.\n\n" +
        `IMPORTANT — this overrides the codex-proposal instructions above for THIS entry (id: ${entryId}, name: ` +
        `"${entryName}"): when you learn a new fact ABOUT ${entryName} — physical description, personality, ` +
        "wardrobe, wounds, background, possessions, anything narrative or concrete about who/what they are — " +
        `put it in the Lore Sheet via sheet-proposal, NOT in a codex-proposal (never emit ` +
        `{"type": "modify_entry", "entryId": "${entryId}", ...} for this entry). The Lore Sheet is this entry's ` +
        "source of truth; the user's own separate Sync action is the only supported path from sheet to Codex, " +
        "so a direct codex-proposal here would silently bypass and desync the sheet. codex-proposal stays fine " +
        "for two other cases only: proposing a brand-new entry (type=new_entry), or modifying a DIFFERENT " +
        "existing entry (a different entryId) that also came up in conversation."
    );
};

// T9, docs/Lore_Sheet_Inline_Rework_Design.md — sibling to SHEET_PROPOSAL_INSTRUCTIONS above, a
// deliberately distinct fence (not a reuse of sheet-proposal — see that doc's §2.5/§3 risk #2 on
// why overloading the whole-sheet fence with conditional "just this bit" instructions risks the
// model reverting to its well-reinforced whole-sheet habit). Always present alongside the
// whole-sheet instructions when anchored to an entry (same posture as SHEET_PROPOSAL_INSTRUCTIONS
// itself), but only actually fires when the client-side rework context (ChatInterface.tsx's
// reworkContext, "lorebook-sheet-field" case) marks a turn with the "[LOREBOOK SHEET SPAN REWORK]"
// tag below — outside of that, the model should keep using sheet-proposal as instructed above.
const SHEET_SPAN_PROPOSAL_INSTRUCTIONS = (entryName: string): string =>
    `Separately, the user can highlight one specific passage inside this entry's Lore Sheet and ask you to rework ` +
    `just that passage — you'll see a message marked "[LOREBOOK SHEET SPAN REWORK]" with BEFORE/SELECTION/AFTER ` +
    "context when this happens. In that case ONLY, reply with a fenced block containing ONLY the replacement " +
    "text for SELECTION — not the whole sheet, not BEFORE/AFTER, and no `## Heading` line unless the original " +
    "selection already included one:\n\n" +
    "```sheet-span-proposal\n" +
    "replacement text...\n" +
    "```\n\n" +
    "Propose at most one sheet-span-proposal per reply, and never emit both sheet-proposal and " +
    `sheet-span-proposal in the same reply. Outside of a "[LOREBOOK SHEET SPAN REWORK]" message, ignore this and ` +
    `keep using sheet-proposal (the entire sheet) as instructed above for ${entryName}.`;

// MCP M2, docs/MCP_Tool_Connections_Design.md §3.3/§3.5 — fence contract + doctrine. Only
// meaningful alongside a non-empty catalogue block (built client-side, ChatInterface.tsx), which
// is why "never fabricate" is spelled out explicitly: an armed-but-empty catalogue is a real state
// (design §3.3's own "empty catalogue → honest 'no tools; don't invent'").
const MCP_TOOLS_INSTRUCTIONS =
    "If a list of available MCP tools appears in your context, you may propose calling ONE of them " +
    "when it would genuinely help. Never fabricate a tool call result yourself, never claim you " +
    "already called a tool, and never invent a tool or connection that isn't in the list. To " +
    "propose a call, include a fenced block in this exact form:\n\n" +
    "```mcp-tool-call-proposal\n" +
    '{ "connectionId": "...", "toolName": "...", "args": { }, "reason": "..." }\n' +
    "```\n\n" +
    "Use the connectionId and toolName exactly as shown in the tool list. `reason` should briefly " +
    "explain why this call would help. You may include more than one such fenced block in a single " +
    "reply if more than one distinct call is genuinely useful. If no tool list appears in your " +
    "context, or the list is empty, don't emit this fence at all.";

// Assemble the effective system prompt for a chat: chat-type framing + template hint (World-
// Building only). Extend the framing constants above — not the template catalogue — when
// adding further global system instructions.
const buildSystemPrompt = (
    chatType: ChatType,
    templateSlug: string | null,
    style?: string,
    includeMemory?: boolean,
    includePsychModule?: boolean,
    includeSexualityModule?: boolean,
    includeMcpTools?: boolean,
    availableNameRegions: string[] = [],
    anchorEntry?: { entryId: string; name: string; category: string; sheetBody?: string | null },
    autoBrainstormCards?: boolean
): string => {
    // Only the four chat types whose framing/instructions above actually include
    // NAME_PROPOSAL_INSTRUCTIONS (editor/outline/worldbuilding/brainstorm — never
    // research/notes) get the addendum; computing it once here keeps that in sync automatically
    // rather than needing to remember to add it at each of the 5 return sites below.
    const regionsAddendum = nameRegionsAddendum(availableNameRegions);
    // Unlike regionsAddendum, MCP applies to every chat type (design §3.3's desk list explicitly
    // includes Research and Notes) — computed once, appended at every return site below.
    const mcpAddendum = includeMcpTools ? `\n\n${MCP_TOOLS_INSTRUCTIONS}` : "";

    if (chatType === "editor") return PROSE_PROPOSAL_INSTRUCTIONS + regionsAddendum + mcpAddendum;
    if (chatType === "outline") return OUTLINE_FRAMING + resolveStyleHint(OUTLINE_STYLE_HINTS, style) + regionsAddendum + mcpAddendum;
    if (chatType === "research") return RESEARCH_FRAMING + mcpAddendum;
    if (chatType === "notes") return NOTES_FRAMING + mcpAddendum;
    if (chatType === "brainstorm") {
        return (
            BRAINSTORM_FRAMING +
            resolveStyleHint(BRAINSTORM_STYLE_HINTS, style) +
            "\n\n" +
            OVERVIEW_PROPOSAL_INSTRUCTIONS(includeMemory === true) +
            "\n\n" +
            HANDOFF_PACKET_INSTRUCTIONS +
            "\n\n" +
            NOTE_PROPOSAL_INSTRUCTIONS +
            "\n\n" +
            NAME_PROPOSAL_INSTRUCTIONS +
            "\n\nWrite your normal conversational reply around any blocks — they're stripped out before the user " +
            "sees them, so don't reference the fenced blocks themselves in your prose; just talk about the proposal naturally." +
            (autoBrainstormCards === false ? AUTO_PROPOSAL_SUPPRESSED_ADDENDUM : "") +
            regionsAddendum +
            mcpAddendum
        );
    }

    const template = templateSlug ? getTemplate(templateSlug as Parameters<typeof getTemplate>[0]) : undefined;
    const base = template?.systemPromptHint ? `${WORLDBUILDING_FRAMING}\n\n${template.systemPromptHint}` : WORLDBUILDING_FRAMING;
    const withStyle = base + resolveStyleHint(WB_STYLE_HINTS, style);
    // T5 FS4 — "bulk profile authoring" applies to any WB template once anchored to an entry, not
    // just character_codex/locations' own dedicated psych/place-sheet fences (which stay
    // targeted-field extras, unaffected by this). Timeline chats are never entry-anchored (see
    // TIMELINE_PIN_INSTRUCTIONS' own comment), so anchorEntry is always undefined there in practice.
    const sheetAddendum = anchorEntry
        ? `\n\n${SHEET_PROPOSAL_INSTRUCTIONS(anchorEntry.entryId, anchorEntry.name, anchorEntry.category, anchorEntry.sheetBody)}` +
          `\n\n${SHEET_SPAN_PROPOSAL_INSTRUCTIONS(anchorEntry.name)}`
        : "";
    if (templateSlug === "character_codex" && (includePsychModule || includeSexualityModule)) {
        // Accumulator, not competing early-returns — both modules can be armed on the same chat
        // simultaneously (docs/Sexuality_Playbook_Design.md's own pitfall list flags this
        // explicitly: a second `if (... ) return` here would silently let only whichever check
        // ran first ever take effect).
        const moduleAddendum =
            (includePsychModule ? `\n\n${PSYCH_MODULE_INSTRUCTIONS}` : "") +
            (includeSexualityModule ? `\n\n${SEXUALITY_MODULE_INSTRUCTIONS}` : "");
        return `${withStyle}${moduleAddendum}${sheetAddendum}${regionsAddendum}${mcpAddendum}`;
    }
    if (templateSlug === "locations")
        return `${withStyle}\n\n${PLACE_SHEET_INSTRUCTIONS}\n\n${MAP_SKETCH_INSTRUCTIONS}${sheetAddendum}${regionsAddendum}${mcpAddendum}`;
    if (templateSlug === "timeline") return `${withStyle}\n\n${TIMELINE_PIN_INSTRUCTIONS}${sheetAddendum}${regionsAddendum}${mcpAddendum}`;
    return withStyle + sheetAddendum + regionsAddendum + mcpAddendum;
};

// Global ∪ story ∪ series name-pool regions currently installed (reuses the exact same scope
// resolution generate() itself uses, nameGeneratorRepository.ts's listPoolsForScope) — so the
// hint above always reflects what a name-proposal could actually match, not a stale/static list.
const resolveAvailableNameRegions = async (storyId: string | null): Promise<string[]> => {
    const pools = await listPoolsForScope(storyId ?? undefined, {});
    return [...new Set(pools.map(p => p.region))].sort();
};

// B6 (docs/BUGS_2026-08-19.md) — the full, deterministic list of this story's character-category
// Lorebook entries, independent of RAG relevance ranking. resolveCodexEntries below only ever
// surfaces the top RELEVANT_ENTRIES_LIMIT entries semantically similar to the current turn's
// text, which silently omits any established character not close to that turn's topic — exactly
// what let the model invent/duplicate names in QA. Names only, ordered alphabetically. Scoping
// conditions (global/story/series level) mirror aiReviewService.ts's resolveCastForChapters,
// minus its occurrence-count text matching — we want the complete roster, not just who's
// mentioned in a specific passage.
const resolveCharacterRoster = async (storyId: string): Promise<{ roster: { id: string; name: string }[]; truncated: boolean }> => {
    const [story] = await db.select({ seriesId: schema.stories.seriesId }).from(schema.stories).where(eq(schema.stories.id, storyId));

    const conditions = [
        and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "global")),
        and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (story?.seriesId) {
        conditions.push(
            and(eq(schema.lorebookEntries.category, "character"), eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, story.seriesId))
        );
    }

    const rows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(or(...conditions))
        .orderBy(schema.lorebookEntries.name);

    return { roster: rows.slice(0, CHARACTER_ROSTER_CAP), truncated: rows.length > CHARACTER_ROSTER_CAP };
};

// MCP M2 — flattens every enabled, in-scope connection's cached tools/list result into one
// compact per-tool list for the prompt. Capped + truncated flag (see MCP_TOOL_CATALOGUE_LIMIT
// above), same "cap + honest disclosure" shape as resolveCharacterRoster.
const resolveMcpToolCatalogue = async (
    includeMcpTools: boolean,
    storyId: string | null
): Promise<{ catalogue: { connectionId: string; connectionName: string; toolName: string; description: string }[]; truncated: boolean }> => {
    if (!includeMcpTools) return { catalogue: [], truncated: false };
    const connections = await listChatVisibleConnections(storyId);
    const entries = connections.flatMap(connection =>
        (connection.toolsCatalogue as { name: string; description: string }[]).map(tool => ({
            connectionId: connection.id,
            connectionName: connection.name,
            toolName: tool.name,
            description: tool.description
        }))
    );
    return { catalogue: entries.slice(0, MCP_TOOL_CATALOGUE_LIMIT), truncated: entries.length > MCP_TOOL_CATALOGUE_LIMIT };
};

// `excludeIds` keeps anchor/related entries (resolveAnchorAndRelated, below) from being listed
// twice if RAG search also happens to surface them.
const resolveCodexEntries = async (
    results: SearchResult[],
    excludeIds: Set<string>
): Promise<ChatContextCodexEntry[]> => {
    const lorebookResults = results
        .filter(r => r.entityType === "lorebook_entry" && !excludeIds.has(r.entityId))
        .slice(0, RELEVANT_ENTRIES_LIMIT);
    if (lorebookResults.length === 0) return [];

    const entryIds = [...new Set(lorebookResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.lorebookEntries.id, name: schema.lorebookEntries.name, category: schema.lorebookEntries.category })
        .from(schema.lorebookEntries)
        .where(inArray(schema.lorebookEntries.id, entryIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return lorebookResults.map(r => ({
        entryId: r.entityId,
        name: meta.get(r.entityId)?.name ?? r.entityId,
        category: meta.get(r.entityId)?.category ?? "unknown",
        excerpt: r.content,
        role: "search" as const
    }));
};

// A Lorebook entry included directly in context, not via RAG ranking — either the chat's own
// anchor entry (WorldBuildingChatPanel opened it, aiChats.anchorEntryId) or a one-hop
// metadata.relationships target of that anchor. Degrades gracefully to an empty array rather
// than throwing if the anchor entry (or a related target) no longer exists — anchorEntryId is a
// plain column, not a real FK (see schema.ts's comment on it for why), so a deleted entry's id
// can linger with no DB-level cascade to clean it up.
// Secrets (2026-08-14) — the only place chapter-scoped auto-reveal is actually evaluated, since
// this is the one codexState-forwarding path that legitimately knows which chapter (if any) the
// current chat is anchored to (Editor chats only — resolveAnchorChapter's own comment). Manual
// `revealed` always wins regardless of chapter; `revealedAtChapterId` only adds visibility once
// the anchored chapter's own order has reached that chapter's order (never for a WB/other chat
// with no anchor chapter — those get manual-only, same as the static RAG index).
const filterRevealedSecrets = async (state: CodexState | null, anchorChapterId: string | null): Promise<CodexState | null> => {
    if (!state?.secrets?.length) return state;

    let anchorOrder: number | null = null;
    if (anchorChapterId) {
        const [chapterRow] = await db.select({ order: schema.chapters.order }).from(schema.chapters).where(eq(schema.chapters.id, anchorChapterId));
        anchorOrder = chapterRow?.order ?? null;
    }

    let revealedAtOrders: Map<string, number> | null = null;
    if (anchorOrder !== null) {
        const chapterIds = [...new Set(state.secrets.map(s => s.revealedAtChapterId).filter((id): id is string => !!id))];
        if (chapterIds.length > 0) {
            const rows = await db.select({ id: schema.chapters.id, order: schema.chapters.order }).from(schema.chapters).where(inArray(schema.chapters.id, chapterIds));
            revealedAtOrders = new Map(rows.map(r => [r.id, r.order]));
        }
    }

    const secrets = state.secrets.filter(s => {
        if (s.revealed) return true;
        if (anchorOrder === null || !s.revealedAtChapterId || !revealedAtOrders) return false;
        const revealOrder = revealedAtOrders.get(s.revealedAtChapterId);
        return revealOrder !== undefined && anchorOrder >= revealOrder;
    });
    return { ...state, secrets };
};

const resolveAnchorAndRelated = async (anchorEntryId: string | null, anchorChapterId: string | null = null): Promise<ChatContextCodexEntry[]> => {
    if (!anchorEntryId) return [];

    const [anchorRow] = await db
        .select({
            id: schema.lorebookEntries.id,
            name: schema.lorebookEntries.name,
            category: schema.lorebookEntries.category,
            description: schema.lorebookEntries.description,
            metadata: schema.lorebookEntries.metadata,
            codexState: schema.lorebookEntries.codexState,
            sheetBody: schema.lorebookEntries.sheetBody
        })
        .from(schema.lorebookEntries)
        .where(eq(schema.lorebookEntries.id, anchorEntryId));
    if (!anchorRow) return [];

    const metadata = parseJson(anchorRow.metadata as string | null | undefined) as
        | { relationships?: Array<{ targetId: string; type: string; description?: string }> }
        | null;
    const relationships = metadata?.relationships ?? [];
    const filteredCodexState = await filterRevealedSecrets(anchorRow.codexState as CodexState | null, anchorChapterId);

    const entries: ChatContextCodexEntry[] = [
        {
            entryId: anchorRow.id,
            name: anchorRow.name,
            category: anchorRow.category,
            excerpt: anchorRow.description,
            role: "anchor",
            codexState: filteredCodexState,
            sheetBody: anchorRow.sheetBody
        }
    ];

    const targetIds = [...new Set(relationships.map(r => r.targetId))].filter(id => id !== anchorEntryId);
    if (targetIds.length > 0) {
        const relatedRows = await db
            .select({
                id: schema.lorebookEntries.id,
                name: schema.lorebookEntries.name,
                category: schema.lorebookEntries.category,
                description: schema.lorebookEntries.description
            })
            .from(schema.lorebookEntries)
            .where(inArray(schema.lorebookEntries.id, targetIds));
        const relatedMeta = new Map(relatedRows.map(r => [r.id, r]));

        for (const rel of relationships) {
            const target = relatedMeta.get(rel.targetId);
            if (!target) continue; // stale relationship target (entry since deleted) — skip silently
            entries.push({
                entryId: target.id,
                name: target.name,
                category: target.category,
                excerpt: rel.description ? `${rel.type}: ${rel.description} — ${target.description}` : `${rel.type} — ${target.description}`,
                role: "related"
            });
        }
    }

    return entries;
};

// Chapter passages are only pulled for Editor chats (see getChatContext) — chapter content
// must actually be indexed first via POST /api/rag/index/chapter/:chapterId, which the
// chapter-content autosave now triggers (debounced) — see SaveChapterContent's plugin.
// `excludeIds` keeps the anchor chapter (resolveAnchorChapter, below) from being listed twice if
// RAG search also happens to surface a different chunk of it.
const resolveChapterPassages = async (
    results: SearchResult[],
    excludeIds: Set<string>
): Promise<ChatContextChapterPassage[]> => {
    const chapterResults = results
        .filter(r => r.entityType === "chapter" && !excludeIds.has(r.entityId))
        .slice(0, RELEVANT_ENTRIES_LIMIT);
    if (chapterResults.length === 0) return [];

    const chapterIds = [...new Set(chapterResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.chapters.id, title: schema.chapters.title })
        .from(schema.chapters)
        .where(inArray(schema.chapters.id, chapterIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return chapterResults.map(r => ({
        chapterId: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        excerpt: r.content,
        role: "search" as const
    }));
};

// A chapter included directly in context, not via RAG ranking — the chat's own anchor chapter
// (EditorChatRail opened it while StoryEditor was focused there, aiChats.anchorChapterId). Pulls
// every one of the chapter's own ragChunks directly (entityType='chapter', entityId=
// anchorChapterId), ordered by chunkIndex — bypassing RAG relevance ranking entirely (it's the
// chapter actually being worked on, not a maybe-relevant one), same "bypass ranking, keep the
// real content" move resolveAnchorAndRelated makes for the entry case. Deliberately unbounded
// (all chunks, not RELEVANT_ENTRIES_LIMIT-capped) so a long chapter isn't silently truncated —
// reuses the indexing pipeline's existing per-chunk size bound rather than adding new truncation
// logic. Degrades gracefully to [] if the chapter no longer exists or hasn't been indexed yet.
const resolveAnchorChapter = async (anchorChapterId: string | null): Promise<ChatContextChapterPassage[]> => {
    if (!anchorChapterId) return [];

    const [chapterRow] = await db
        .select({ id: schema.chapters.id, title: schema.chapters.title })
        .from(schema.chapters)
        .where(eq(schema.chapters.id, anchorChapterId));
    if (!chapterRow) return [];

    const chunks = await db
        .select({ content: schema.ragChunks.content })
        .from(schema.ragChunks)
        .where(and(eq(schema.ragChunks.entityType, "chapter"), eq(schema.ragChunks.entityId, anchorChapterId)))
        .orderBy(schema.ragChunks.chunkIndex);
    if (chunks.length === 0) return [];

    return chunks.map(c => ({ chapterId: chapterRow.id, title: chapterRow.title, excerpt: c.content, role: "anchor" as const }));
};

// Notes are only ever surfaced via RAG search (no anchor concept) — gated entirely on the
// double gate already having passed (note.includeInAi AND this chat's includeNotes, see
// getChatContext, which only adds "note" to entityTypes when the chat toggle is on; a note
// without includeInAi never gets indexed at all — see routes/notes.ts).
const resolveNotes = async (results: SearchResult[]): Promise<ChatContextNoteExcerpt[]> => {
    const noteResults = results.filter(r => r.entityType === "note").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (noteResults.length === 0) return [];

    const noteIds = [...new Set(noteResults.map(r => r.entityId))];
    const rows = await db.select({ id: schema.notes.id, title: schema.notes.title }).from(schema.notes).where(inArray(schema.notes.id, noteIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return noteResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        excerpt: r.content,
        role: "search" as const
    }));
};

// Same posture as resolveNotes, for outline items — gated on this chat's includeOutline toggle.
const resolveOutlineItems = async (results: SearchResult[]): Promise<ChatContextOutlineExcerpt[]> => {
    const itemResults = results.filter(r => r.entityType === "outline_item").slice(0, RELEVANT_ENTRIES_LIMIT);
    if (itemResults.length === 0) return [];

    const itemIds = [...new Set(itemResults.map(r => r.entityId))];
    const rows = await db
        .select({ id: schema.outlineItems.id, title: schema.outlineItems.title, type: schema.outlineItems.type })
        .from(schema.outlineItems)
        .where(inArray(schema.outlineItems.id, itemIds));
    const meta = new Map(rows.map(r => [r.id, r]));

    return itemResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        type: (meta.get(r.entityId)?.type as "chapter" | "scene" | undefined) ?? "scene",
        excerpt: r.content,
        role: "search" as const
    }));
};

// The Notes chat's own always-on structured read (P0.4 K1) — every note in the story, titles/
// types only (not full content, that's resolveFocusedNote below), not RAG-ranked, and — unlike
// resolveNotes above — deliberately NOT gated by includeInAi. Design doc §7: "Other story notes |
// All story notes (desk privilege — not limited to armed)" — the Notes tool is the note's own
// home, so seeing the full list regardless of AI-arm status is expected, not a bridge leak.
const resolveAllStoryNotes = async (storyId: string): Promise<{ id: string; title: string; type: string; updatedAt: Date }[]> =>
    db
        .select({ id: schema.notes.id, title: schema.notes.title, type: schema.notes.type, updatedAt: schema.notes.updatedAt })
        .from(schema.notes)
        .where(eq(schema.notes.storyId, storyId))
        .orderBy(schema.notes.updatedAt);

// The Notes chat's "focused note" read (P0.4 K1) — full body of whichever note is currently open
// in the Notes tool (NotesTool.tsx passes its own selectedNoteId down, see ChatInterface.tsx's
// focusedNoteId prop). Same "always include, not RAG-ranked" posture as resolveAnchorChapter;
// degrades to null rather than throwing if the note was deleted since the id was captured.
const resolveFocusedNote = async (
    noteId: string | null
): Promise<{ id: string; title: string; content: string; type: string; pinned: boolean } | null> => {
    if (!noteId) return null;
    const [note] = await db
        .select({
            id: schema.notes.id,
            title: schema.notes.title,
            content: schema.notes.content,
            type: schema.notes.type,
            pinned: schema.notes.pinned
        })
        .from(schema.notes)
        .where(eq(schema.notes.id, noteId));
    return note ?? null;
};

// The Outline chat's own always-on structured read (P0.4 R5) — every outlineItem in the story,
// not RAG-ranked and not gated by the includeOutline toggle (that toggle stays the *other* chat
// types' opt-in path, see resolveOutlineItems above). Excludes rejected items (dead ends the
// model shouldn't be planning around); includes pending ("AI Suggested", not yet accepted) ones
// since seeing them helps the model avoid re-proposing the same thing.
const resolveFullOutlineTree = async (storyId: string): Promise<ChatContextOutlineTreeItem[]> => {
    const rows = await db
        .select({
            id: schema.outlineItems.id,
            parentId: schema.outlineItems.parentId,
            type: schema.outlineItems.type,
            title: schema.outlineItems.title,
            summary: schema.outlineItems.summary,
            order: schema.outlineItems.order,
            chapterId: schema.outlineItems.chapterId
        })
        .from(schema.outlineItems)
        .where(and(eq(schema.outlineItems.storyId, storyId), ne(schema.outlineItems.status, "rejected")))
        .orderBy(schema.outlineItems.order);

    return rows.map(r => ({
        id: r.id,
        parentId: r.parentId,
        type: r.type as "chapter" | "scene",
        title: r.title,
        summary: r.summary,
        order: r.order,
        chapterId: r.chapterId
    }));
};

// "Written chapters: titles + summaries only" (P0.4 R5) — chapters.summary is a distinct field
// from any linked outlineItem's own summary (see server/db/schema.ts), so this is a real, separate
// read, not a subset of resolveFullOutlineTree above. Never includes chapter body content.
const resolveWrittenChapterSummaries = async (storyId: string): Promise<ChatContextWrittenChapter[]> => {
    const rows = await db
        .select({
            id: schema.chapters.id,
            title: schema.chapters.title,
            summary: schema.chapters.summary,
            order: schema.chapters.order
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.storyId, storyId))
        .orderBy(schema.chapters.order);

    return rows;
};

// Active Project Memory entries surfaced two ways, gated entirely on this chat's includeMemory
// toggle (see getChatContext) — every `status: "active"` memory is already index-eligible on its
// own (agentMemoriesService.ts's approve step is the gate), unlike notes/outline which need their
// own per-item includeInAi flag too:
//   - "search": ranked into this turn's hybridSearch pool, same as before
//   - "pinned": P1.1 pin semantics — a pinned active memory is a standing fact the writer wants
//     the model to never lose track of, so it's always included rather than left to compete on
//     ranking (which can drop it if the pool fills with more topically-relevant-but-less-important
//     chunks). Deduped against search hits so a pinned+ranked memory doesn't appear twice.
const resolveMemories = async (results: SearchResult[], storyId: string | null): Promise<ChatContextMemoryExcerpt[]> => {
    const memoryResults = results.filter(r => r.entityType === "agent_memory").slice(0, RELEVANT_ENTRIES_LIMIT);
    const memoryIds = [...new Set(memoryResults.map(r => r.entityId))];

    type MemoryMetaRow = { id: string; title: string; category: string };
    type PinnedMemoryRow = { id: string; title: string; category: string; body: string };

    const [metaRows, pinnedRows] = await Promise.all([
        memoryIds.length
            ? db
                  .select({ id: schema.agentMemories.id, title: schema.agentMemories.title, category: schema.agentMemories.category })
                  .from(schema.agentMemories)
                  .where(inArray(schema.agentMemories.id, memoryIds))
            : Promise.resolve([] as MemoryMetaRow[]),
        storyId
            ? db
                  .select({
                      id: schema.agentMemories.id,
                      title: schema.agentMemories.title,
                      category: schema.agentMemories.category,
                      body: schema.agentMemories.body
                  })
                  .from(schema.agentMemories)
                  .where(
                      and(
                          eq(schema.agentMemories.storyId, storyId),
                          eq(schema.agentMemories.status, "active"),
                          eq(schema.agentMemories.pinned, true)
                      )
                  )
            : Promise.resolve([] as PinnedMemoryRow[])
    ]);
    const meta = new Map(metaRows.map(r => [r.id, r]));

    const searchExcerpts: ChatContextMemoryExcerpt[] = memoryResults.map(r => ({
        id: r.entityId,
        title: meta.get(r.entityId)?.title ?? r.entityId,
        category: meta.get(r.entityId)?.category ?? "unknown",
        excerpt: r.content,
        role: "search" as const
    }));

    const searchIds = new Set(searchExcerpts.map(e => e.id));
    const pinnedExcerpts: ChatContextMemoryExcerpt[] = pinnedRows
        .filter(r => !searchIds.has(r.id))
        .map(r => ({ id: r.id, title: r.title, category: r.category, excerpt: r.body, role: "pinned" as const }));

    return [...pinnedExcerpts, ...searchExcerpts];
};

// Gated on includeGuide only — searchGuideForChat already returns [] below its own minimum-score
// threshold, so this stays empty on ordinary story-writing turns without any extra gating here.
const resolveGuideSections = (query: string): ChatContextGuideExcerpt[] =>
    searchGuideForChat(query).map(section => ({
        topicLabel: section.topicLabel,
        subTabLabel: section.subTabLabel ?? null,
        heading: section.heading,
        excerpt: section.body.slice(0, 500)
    }));

// Lets the model see whether prior proposals/handoffs from this same Brainstorm chat are still
// sitting unresolved (status pending/opened) before proposing more (P0.4 B4).
const resolveHandoffStatus = async (chatId: string) => {
    const [active, done] = await Promise.all([
        getChecklistCounts(chatId, "active"),
        getChecklistCounts(chatId, "done")
    ]);
    return { activeCount: active, doneCount: done };
};

// P0.4 S1 — Research's live web search, query-driven rather than toggle-gated like Notes/Memory
// above (a static per-chat toggle can't know what THIS turn is asking about). Only ever invoked
// with an explicit per-turn query, never the chat.title fallback getChatContext's RAG search uses
// — see getChatContext's explicitQuery. Any http(s) URL found in the query text is fetched too
// (capped at MAX_FETCHED_PAGES), covering S1's "page fetch" half. Both searchWeb/fetchPage
// already fail soft (return [] / null) on network/parse errors — never throws into the chat-send
// path.
const URL_REGEX = /https?:\/\/[^\s)]+/g;
const MAX_FETCHED_PAGES = 2;

const resolveWebSearch = async (
    query: string
): Promise<{ results: Awaited<ReturnType<typeof searchWeb>>; pages: (FetchedPage & { url: string })[] }> => {
    const urls = [...new Set(query.match(URL_REGEX) ?? [])].slice(0, MAX_FETCHED_PAGES);
    const [results, pageResults] = await Promise.all([
        searchWeb(query),
        Promise.all(urls.map(async url => ({ url, page: await fetchPage(url) })))
    ]);
    const pages = pageResults
        .filter((r): r is { url: string; page: FetchedPage } => r.page !== null)
        .map(r => ({ url: r.url, title: r.page.title, text: r.page.text }));
    return { results, pages };
};

// Character Guided Playbook Packs (Hybrid D) — direct ladder resolve, NOT RAG-ranked (design doc
// §5: "direct inject of resolved pack body while armed", explicitly not "hope hybrid search finds
// the note"). Converts the service's PlaybookPack row into the leaner context shape (drops id/
// title/timestamps the model doesn't need). Missing pack = null, not an error — soft success.
const resolvePlaybookPackContext = async (
    storyId: string | null,
    playbookKey: string,
    style: string
): Promise<ChatContextPlaybookPack | null> => {
    const pack = await resolvePlaybookPackLadder(storyId, playbookKey, style);
    return pack ? { playbookKey: pack.playbookKey, style: pack.style, scope: pack.packScope as "shipped" | "global" | "story", body: pack.body } : null;
};

/**
 * Assemble everything a chat needs to generate a well-grounded response or proposal:
 *   - systemPrompt: chat-type framing (+ template hint for World-Building)
 *   - pendingProposals: this chat's own not-yet-resolved Codex proposals, so it can
 *     follow up on or revise them instead of re-proposing the same thing
 *   - projectSynopsis: the story's own synopsis, injected unconditionally (not RAG-dependent)
 *     as baseline project grounding for any story-scoped chat
 *   - relevantCodexEntries: the chat's anchor entry (if any, see aiChats.anchorEntryId) plus its
 *     one-hop metadata.relationships targets — always included, not RAG-ranked — followed by
 *     whatever else a RAG hybrid-index search for `query` (defaults to the chat's title) surfaces
 *   - relevantChapterPassages: the chat's anchor chapter (if any, see aiChats.anchorChapterId,
 *     Editor chats only), pulled directly from its own ragChunks — always included, not
 *     RAG-ranked — followed by whatever else the RAG search surfaces (chapter entity type only
 *     populates for Editor chats)
 *   - relevantNotes / relevantOutlineItems: non-canon working material, only populated when this
 *     chat's own includeNotes/includeOutline toggle is on (Notes_Outline_Chat_Bridges_Design.md's
 *     double gate — the other half is each note/outline item's own includeInAi flag, enforced at
 *     index time, see routes/notes.ts / routes/outline.ts)
 *   - relevantMemories: active Project Memory entries, only populated when this chat's own
 *     includeMemory toggle is on (C1, Agent_Framework_And_Project_Memory_Design.md §4.5) — no
 *     separate per-memory flag, every active memory is already index-eligible on its own
 *   - outlineTree / writtenChapters: the Outline chat's own always-on structured reads (P0.4 R5)
 *     — full outline tree + written chapter titles/summaries, not RAG-ranked, not toggle-gated.
 *     Empty for every other chatType.
 *   - chapterSummaries: written chapter titles+summaries, populated when this chat's own
 *     includeChapterSummaries toggle is on (P0.4 B0-B4) — reuses writtenChapters' own resolver.
 *   - priorSetupSlots / handoffStatus: Brainstorm's always-on setup-slot checklist + this chat's
 *     own checklist activity counts (P0.4 B2/B4). Empty/zero for every other chatType.
 *   - webSearchResults / fetchedPages: Research's live web search (P0.4 S1), only populated for
 *     chatType="research" with webSearchEnabled on AND an explicit `query` passed in (never the
 *     chat.title fallback) — see resolveWebSearch/explicitQuery below.
 *   - allNotes / focusedNote: the Notes chat's own always-on desk reads (P0.4 K1) — every story
 *     note's title/type (not gated by includeInAi, a "desk privilege") and the full body of
 *     whichever note is currently open in the Notes tool (the `focusedNoteId` param). Empty/null
 *     for every other chatType.
 *   - playbookPack: Character Guided Playbook Packs (Hybrid D) — only populated when this chat's
 *     own usePlaybookPack toggle is on AND templateSlug is "character_codex" (v1 scope). Direct
 *     ladder resolve (story -> global -> shipped), not RAG-ranked. `psych` only resolves when
 *     includePsychModule is also on; `sexuality` only resolves when includeSexualityModule is
 *     also on (docs/Sexuality_Playbook_Design.md — exact sibling of the psych lane).
 *
 * Degrades gracefully rather than failing: if the story has no indexed content, no embedding
 * endpoint is configured, or an anchor entry/chapter no longer exists, the relevant-* fields are
 * simply empty/absent (search() itself already falls back to keyword-only when embeddings are
 * unavailable; resolveAnchorAndRelated/resolveAnchorChapter return [] rather than throwing on a
 * missing anchor).
 */
export const getChatContext = async (chatId: string, query?: string, focusedNoteId?: string): Promise<ChatContext> => {
    const chat = await getChatById(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);

    const effectiveQuery = query?.trim() || chat.title;
    // P0.4 S1 — Research's web search must only fire on a real per-turn query, never the
    // chat.title fallback effectiveQuery uses for RAG search (that would fire a live scrape on
    // every mount/toggle-change context fetch with a nonsense query). See resolveWebSearch below.
    const explicitQuery = query?.trim() || null;
    const chatType = (chat.chatType ?? "general") as ChatType;
    const includeChapters = chatType === "editor";
    const includeOutlineTree = chatType === "outline";
    const includeNotes = chat.includeNotes === true;
    const includeOutline = chat.includeOutline === true;
    const includeMemory = chat.includeMemory === true;
    // TL8 — read directly as a plain column, same posture as includeMemory (no separate per-pin
    // gate; a pin's presence on Spine is itself the "should this be visible" decision).
    const includeTimeline = chat.includeTimeline === true;
    // Not routed through search()/entityTypes/hybridSearch — the guide isn't story-scoped and
    // doesn't fit hybridSearch's required storyId partition (see guideSearchService.ts's own
    // header comment). Works identically for story-scoped and story-less (e.g. Research) chats.
    const includeGuide = chat.includeGuide === true;
    // MCP M2 — available on every chat type (design §3.3), same posture as includeGuide above.
    const includeMcpTools = chat.includeMcpTools === true;
    const isBrainstorm = chatType === "brainstorm";
    const isResearch = chatType === "research";
    const isNotes = chatType === "notes";
    const includeChapterSummaries = chat.includeChapterSummaries === true;
    const includeLorebook = chat.includeLorebook === true;
    const webSearchEnabled = isResearch && chat.webSearchEnabled !== false;
    // P0.4 B5 — each host's own guided-start style column (mirrors chat.brainstormStyle's
    // posture: a plain column read, ignored for every other chatType). Character psych module is
    // only ever offered when this chat is also anchored to an entry — an unanchored WB chat has
    // nowhere to attach a psych-proposal Accept, so the model is never even told the fence exists.
    const style =
        chatType === "brainstorm" ? chat.brainstormStyle
        : chatType === "worldbuilding" ? chat.wbStyle
        : chatType === "outline" ? chat.outlineStyle
        : undefined;
    const includePsychModule = chat.includePsychModule === true && !!chat.anchorEntryId;
    const includeSexualityModule = chat.includeSexualityModule === true && !!chat.anchorEntryId;
    // Character Guided Playbook Packs — v1 scope is Character template only (design doc §9's
    // "Location/other templates: reuse PP* patterns later"). Global chats (no storyId) still
    // resolve fine — resolvePlaybookPackContext treats null storyId as "skip the story tier".
    const usePlaybookPack = chat.usePlaybookPack === true && chat.templateSlug === "character_codex";

    // Only build a non-default entityTypes array when a bridge toggle is actually on — search()/
    // hybridSearch's own DEFAULT_SEARCH_ENTITY_TYPES stays the single source of truth for
    // "omitted" otherwise (design doc §4.5). Brainstorm/Research/Notes all need lorebook_entry to
    // become opt-in (P0.4 B0-B4 / S4 / K1) — every other chat type's lorebook search stays
    // always-on, unchanged. Research and Notes additionally get NO default entities at all (not
    // even "chapter") — design doc §6/§7: both are explicitly "chapters/manuscript OFF."
    let entityTypes: RagEntityType[];
    if (isBrainstorm) {
        entityTypes = DEFAULT_SEARCH_ENTITY_TYPES.filter(t => t !== "lorebook_entry");
        if (includeLorebook) entityTypes.push("lorebook_entry");
    } else if (isResearch || isNotes) {
        entityTypes = includeLorebook ? ["lorebook_entry"] : [];
    } else {
        entityTypes = [...DEFAULT_SEARCH_ENTITY_TYPES];
    }
    // includeNotes is the "other chats reading Notes via the bridge" toggle — meaningless for the
    // Notes chat itself, which already gets privileged always-on reads (resolveAllStoryNotes/
    // resolveFocusedNote below) instead of the RAG-search path. Never shown as a toggle for Notes
    // chats (ChatInterface.tsx), but excluded here too as defense in depth.
    if (includeNotes && !isNotes) entityTypes.push("note");
    if (includeOutline) entityTypes.push("outline_item");
    if (includeMemory) entityTypes.push("agent_memory");

    // Global chats (e.g. Research) have no storyId, so there's no per-story index/story row to
    // search/fetch, and never carry an anchorEntryId/anchorChapterId (only
    // createWorldBuildingChat/createGenericChat accept those respectively). entityTypes.length > 0
    // guards a real SQL bug in hybridSearch (ragRepository.ts): an empty entityTypes array builds
    // an invalid `entityType IN ()` clause — Research with every toggle off produces exactly that.
    const [pendingProposals, searchResults, storyRows, anchorEntries, anchorChapterPassages, webSearch] = await Promise.all([
        getChatCodexProposals(chatId, "pending"),
        chat.storyId && entityTypes.length > 0
            ? search({ storyId: chat.storyId, query: effectiveQuery, limit: SEARCH_POOL_SIZE, entityTypes })
            : Promise.resolve([]),
        chat.storyId
            ? db.select({ synopsis: schema.stories.synopsis }).from(schema.stories).where(eq(schema.stories.id, chat.storyId))
            : Promise.resolve([]),
        resolveAnchorAndRelated(chat.anchorEntryId, chat.anchorChapterId),
        resolveAnchorChapter(chat.anchorChapterId),
        webSearchEnabled && explicitQuery ? resolveWebSearch(explicitQuery) : Promise.resolve({ results: [], pages: [] })
    ]);

    const anchorIds = new Set(anchorEntries.map(e => e.entryId));
    const anchorChapterIds = new Set(anchorChapterPassages.map(p => p.chapterId));
    const [
        searchCodexEntries,
        searchChapterPassages,
        notes,
        outlineItems,
        memories,
        outlineTree,
        writtenChapters,
        chapterSummaries,
        priorSetupSlots,
        handoffStatus,
        allNotes,
        focusedNote,
        playbookPackConcrete,
        playbookPackPsych,
        playbookPackSexuality,
        availableNameRegions,
        timelinePins,
        guideSections,
        characterRosterResult,
        mcpToolCatalogueResult
    ] = await Promise.all([
        resolveCodexEntries(searchResults, anchorIds),
        includeChapters ? resolveChapterPassages(searchResults, anchorChapterIds) : Promise.resolve([]),
        includeNotes && !isNotes ? resolveNotes(searchResults) : Promise.resolve([]),
        includeOutline ? resolveOutlineItems(searchResults) : Promise.resolve([]),
        includeMemory ? resolveMemories(searchResults, chat.storyId) : Promise.resolve([]),
        includeOutlineTree && chat.storyId ? resolveFullOutlineTree(chat.storyId) : Promise.resolve([]),
        includeOutlineTree && chat.storyId ? resolveWrittenChapterSummaries(chat.storyId) : Promise.resolve([]),
        includeChapterSummaries && chat.storyId ? resolveWrittenChapterSummaries(chat.storyId) : Promise.resolve([]),
        isBrainstorm && chat.storyId ? getSlots(chat.storyId) : Promise.resolve([]),
        isBrainstorm ? resolveHandoffStatus(chatId) : Promise.resolve({ activeCount: 0, doneCount: 0 }),
        isNotes && chat.storyId ? resolveAllStoryNotes(chat.storyId) : Promise.resolve([]),
        isNotes ? resolveFocusedNote(focusedNoteId ?? null) : Promise.resolve(null),
        usePlaybookPack && style ? resolvePlaybookPackContext(chat.storyId, "character_codex", style) : Promise.resolve(null),
        usePlaybookPack && includePsychModule ? resolvePlaybookPackContext(chat.storyId, "character_psych", "any") : Promise.resolve(null),
        usePlaybookPack && includeSexualityModule
            ? resolvePlaybookPackContext(chat.storyId, "character_sexuality", "any")
            : Promise.resolve(null),
        // Only these 4 chat types' framing ever includes NAME_PROPOSAL_INSTRUCTIONS — skip the
        // query for research/notes chats, which never propose names.
        ["editor", "outline", "worldbuilding", "brainstorm"].includes(chatType)
            ? resolveAvailableNameRegions(chat.storyId)
            : Promise.resolve([]),
        includeTimeline && chat.storyId ? getSpineChronologyExcerpt(chat.storyId) : Promise.resolve([]),
        includeGuide ? Promise.resolve(resolveGuideSections(effectiveQuery)) : Promise.resolve([]),
        // B6 — reuses the same "is lorebook in scope for this chat" boolean entityTypes already
        // encodes above (always-on for Editor/WorldBuilding/Outline, toggle-gated for Brainstorm/
        // Research/Notes) rather than a new toggle.
        entityTypes.includes("lorebook_entry") && chat.storyId
            ? resolveCharacterRoster(chat.storyId)
            : Promise.resolve({ roster: [], truncated: false }),
        resolveMcpToolCatalogue(includeMcpTools, chat.storyId)
    ]);

    return {
        systemPrompt: buildSystemPrompt(
            chatType,
            chat.templateSlug,
            style,
            includeMemory,
            includePsychModule,
            includeSexualityModule,
            includeMcpTools,
            availableNameRegions,
            anchorEntries.find(e => e.role === "anchor"),
            chat.autoBrainstormCards
        ),
        pendingProposals,
        projectSynopsis: storyRows[0]?.synopsis ?? null,
        relevantCodexEntries: [...anchorEntries, ...searchCodexEntries],
        relevantChapterPassages: [...anchorChapterPassages, ...searchChapterPassages],
        relevantNotes: notes,
        relevantOutlineItems: outlineItems,
        relevantMemories: memories,
        outlineTree,
        writtenChapters,
        chapterSummaries,
        priorSetupSlots,
        handoffStatus,
        webSearchResults: webSearch.results,
        fetchedPages: webSearch.pages,
        allNotes,
        focusedNote,
        playbookPack: { concrete: playbookPackConcrete, psych: playbookPackPsych, sexuality: playbookPackSexuality },
        relevantTimelinePins: timelinePins,
        relevantGuideSections: guideSections,
        characterRoster: characterRosterResult.roster,
        characterRosterTruncated: characterRosterResult.truncated,
        mcpToolCatalogue: mcpToolCatalogueResult.catalogue,
        mcpToolCatalogueTruncated: mcpToolCatalogueResult.truncated
    };
};
