import { attemptPromise } from "@jfdi/attempt";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Library, NotebookPen, Plus, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useBrainstormChecklistQuery } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { ContextSelector } from "@/features/brainstorm/components/ContextSelector";
import { useContextSelection } from "@/features/brainstorm/hooks/useContextSelection";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { ChatContextPanelContent } from "@/features/chat/components/ChatContextPanelContent";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { ChatToolsRail } from "@/features/chat/components/ChatToolsRail";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { GuidedSetupControl } from "@/features/chat/components/GuidedSetupControl";
import { ShuttleTray } from "@/features/chat/components/ShuttleTray";
import { useChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import { useChatListCollapse } from "@/features/chat/hooks/useChatListCollapse";
import { useChatsByStoryQuery, useChatTemplatesQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { useChatProposalsQuery } from "@/features/chat/hooks/useCodexProposalsQuery";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { getFilteredEntries as getFilteredLorebookEntries } from "@/features/lorebook/utils/lorebookFilters";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import { useSeriesQuery } from "@/features/series/hooks/useSeriesQuery";
import { OpenMapButton } from "@/features/story-maps/components/OpenMapButton";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useStoryQuery } from "@/features/stories/hooks/useStoriesQuery";
import { PlaceOnTimelineButton } from "@/features/story-timeline/components/PlaceOnTimelineButton";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";
import { cn } from "@/lib/utils";
import { codexApi, lorebookApi, chatsApi } from "@/services/api/client";
import type { DocumentImportDraft } from "@/types/codex";
import type { AIChat, LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";
import { toastCRUD } from "@/utils/toastUtils";
import type { ChatStyle, WorldBuildingSeed, WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { getTemplate } from "@/types/worldbuilding";
import { lorebookKeys, useCreateLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { LorebookScribbleContent } from "./LorebookScribbleContent";
import { PsychProfilePanel } from "./PsychProfilePanel";
import { SexualityProfilePanel } from "./SexualityProfilePanel";
import type { SyncSheetResult } from "@/services/api/lorebookClient";
import {
    AdvancedSettings,
    CodexHistoryPanel,
    CodexPendingChangesPanel,
    EMPTY_CODEX_STATE,
    ExtractPinsButton,
    ImageUploadField,
    LevelScopeFields,
    LoreSheetEditor,
    RawEntryFields,
    SheetSyncButton,
    SheetSyncCrossDeskCard,
    buildEmptySheetSeed,
    buildSubmitData,
    getDefaultFormValues
} from "./form";
import type { CreateEntryForm, LorebookCategory } from "./form";

// Opening lines for WB's Guided Setup, per style — mirrors BrainstormTool.tsx's own OPENING_LINES
// (P0.4 B5). Generic across templates (doesn't reference the template by name in the line itself;
// the blurb above the control already does that) since a single template-aware sentence per style
// covers all 5 templates without a 5×3 combinatorial table.
const WB_OPENING_LINES: Record<ChatStyle, string> = {
    light: "Let's develop this a bit — a few quick concrete questions.",
    standard: "Let's develop this properly — interview me for what you need.",
    grill: "Let's really dig in — grill me for the concrete details until you've got a full picture."
};

// User-authored psych-module prompt (replaces the old always-on "Psych module" toggle, which
// the user found unreliable — see chat 2026-07-25). Clicking "Add psych prompt" now (a) arms
// includePsychModule for this chat so the model still knows the psych-proposal fence format
// (PSYCH_MODULE_INSTRUCTIONS in chatContextService.ts), and (b) seeds the composer with this
// exact one-shot instruction, ready to send — a deliberate action instead of a standing toggle.
const PSYCH_PROMPT_TEXT =
    "Act as an expert narrative designer and character psychologist. Help me build a comprehensive character profile. " +
    "Ask me 3 questions at a time to gather information about my character's role in the story, basic concept, and vibe. " +
    "After I answer, synthesize the information into a structured profile containing:\n" +
    "1. Core Identity & Logline\n" +
    "2. MBTI & Enneagram Profile (with explanations of why they fit)\n" +
    "3. Core Motivation vs. Core Lie (what they want vs. what they believe)\n" +
    "4. Behavioral Quirks & Speech Patterns\n" +
    "Continue iterating and expanding the profile as we chat.";

// User-authored sexuality-module prompt — exact sibling of PSYCH_PROMPT_TEXT above
// (docs/Sexuality_Playbook_Design.md, locked decision #3): a one-shot button, never a standing
// toggle, and (per decision #4) never auto-armed by a style change, unlike nothing else on this
// chat — deliberate, given the sensitivity of the content.
const SEXUALITY_PROMPT_TEXT =
    "Act as an expert narrative designer helping me build out this character's sexuality and relationship dynamics. " +
    "Ask me 3 questions at a time to gather information about their orientation, how they show up in a relationship " +
    "dynamic, and what draws them in. " +
    "After I answer, synthesize the information into a structured profile containing:\n" +
    "1. Orientation & Identity\n" +
    "2. Relationship Dynamic (dominant/submissive/switch, and how it actually shows up)\n" +
    "3. Kinks & Interests\n" +
    "4. Hard Limits (what's completely off the table)\n" +
    "Continue iterating and expanding the profile as we chat.";

export interface LorebookEntryEditorProps {
    storyId?: string;
    seriesId?: string;
    entry?: LorebookEntry;
    defaultCategory?: LorebookCategory;
    // Seeds a brand-new entry from an AI document-import extraction — see entryFormUtils.ts's
    // getDefaultFormValues. Ignored when `entry` is set (editing always wins over a draft).
    draftValues?: DocumentImportDraft;
    // Only ever set opening from Brainstorm's WB handoff (LorebookNewEntryTab, or the "entry" tab
    // it gets promoted to once a stub entry exists) — auto-starts the docked WB chat on this
    // template and seeds its composer, so the handoff lands ready-to-send like every other
    // destination. See WorldBuildingChatPanel below.
    initialWorldBuildingSeed?: WorldBuildingSeed;
    // Fires once the auto-start above has actually created+selected its chat — lets the caller
    // (LorebookPage) clear the seed from its tab state so it can't refire on a later remount.
    onWorldBuildingSeedConsumed?: () => void;
    // Called after a successful create/update. Sheet usage closes itself; tab usage can leave
    // the tab open (entry tabs have nothing else to navigate back to).
    onSaved?: () => void;
    // Omitted entirely for tab usage — "Cancel" only makes sense when there's an overlay to
    // dismiss back to; an entry tab just stays open until closed via its tab control.
    onCancel?: () => void;
    // Fires once, the first time a brand-new (no `entry` prop) editor lazily creates its stub
    // entry (see ensureLiveEntry below) — lets the caller promote a "new" tab into a real
    // "entry" tab so the rest of the Codex/chat machinery (already correctly id+updatedAt-keyed
    // for existing entries) takes over instead of this component trying to duplicate it.
    onEntryCreated?: (entry: LorebookEntry) => void;
}

// Docked World-Building chat alongside the entry form — the same chat/template-picker
// composition the old standalone World-Building tool used (now folded in here, see D1/D2 in
// DECISIONS.md), reusing ChatList/ChatInterface rather than a new per-entry chat.
// `entryId` (when editing an existing entry) anchors new chats created here to it — see
// DECISIONS.md's chat-context-anchoring entry and chatContextService.ts's getChatContext.
// For a brand-new not-yet-saved entry, entryId starts undefined — onEnsureEntry lazily creates
// a real (codex-enabled) stub entry the first time a WB chat is actually started, so the chat
// anchors to it instead of running unanchored. An unanchored chat has no entryId to give the
// model, so any Codex proposal it makes becomes a "new_entry" proposal that spawns a second,
// orphaned entry on approval — see LorebookPage.tsx's onEntryCreated wiring for the other half
// of this fix (promotes the "new" tab into a normal, already-correctly-synced "entry" tab).
function WorldBuildingChatPanel({
    storyId,
    entryId,
    entry,
    onEnsureEntry,
    onEntryUpdated,
    onOpenScribble,
    initialWorldBuildingSeed,
    onWorldBuildingSeedConsumed
}: {
    storyId: string;
    entryId?: string;
    entry?: LorebookEntry;
    onEnsureEntry: () => Promise<LorebookEntry>;
    onEntryUpdated?: (entry: LorebookEntry) => void;
    onOpenScribble: () => void;
    initialWorldBuildingSeed?: WorldBuildingSeed;
    onWorldBuildingSeedConsumed?: () => void;
}) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    // ChatList's own built-in collapse toggle only shrinks itself — CodexProposalTray/ShuttleTray
    // are siblings inside the same fixed-width column, not inside ChatList, so that toggle alone
    // can't reclaim the column's width once a chat (and therefore the trays) is selected. This is
    // a second, outer toggle that hides the whole column — same pattern as EditorChatRail's own
    // "Show/Hide Editor Chats" toggle.
    // T10 CR7 — defaults collapsed on first paint (Axis 6), same as every other host's CR7 pass.
    const [railCollapsed, setRailCollapsed] = useChatListCollapse(undefined, undefined, true);
    // T10 CR8 — icon-vs-label width toggle for the ChatToolsRail itself (separate axis from
    // railCollapsed above, which hides/shows the whole Chats column). Mirrors EditorToolsPanel's
    // own collapsed/onToggleCollapsed so the rail gets the same expand chevron + width transition.
    const [toolsRailCollapsed, setToolsRailCollapsed] = useState(true);
    // Single source of truth for the Context & memory toggles, shared with ChatInterface
    // (contextToggles/contextPanelMode="external" below) and the rail's own "Context" panel.
    const contextToggles = useChatContextToggles(selectedChat, "worldbuilding", setSelectedChat);
    // T10-follow-up — same single-source-of-truth pattern as contextToggles above, for the older,
    // separate "Story Context" structured picker (ContextSelector — Include Full Context/Chapter
    // Summaries/Chapter Content/Lorebook Entries), which predates T10 and was never part of the
    // Context & memory bucket CR4 migrated. Was left inline (ChatInterface.tsx's own always-
    // rendered Collapsible) after CR7's WB pass, sitting redundantly next to this rail's own
    // "Context" icon — folded in here on user request. chapters/lorebookEntries are this
    // component's own fetches (ChatInterface already fetches both itself, but a host rendering
    // ContextSelector directly in its own rail panel needs them too — same reasoning
    // WorldBuildingChatPanel already re-fetches `chats` alongside ChatList's identical query).
    const contextSelection = useContextSelection();
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);
    const { entries: lorebookEntries } = useLorebookContext();
    const getFilteredEntries = () => getFilteredLorebookEntries(lorebookEntries, false);
    const handleContextItemSelect = (itemId: string) => {
        const item = getFilteredEntries().find(e => e.id === itemId);
        if (item) contextSelection.addItem(item);
    };
    // Mounted here (not just inside CodexProposalTray/ShuttleTray) so the "Approvals" icon's
    // pending-count badge stays live while its drawer — and those tray components — are unmounted.
    const { data: pendingCodexProposals = [] } = useChatProposalsQuery(selectedChat?.id, "pending");
    const { data: activeShuttleItems = [] } = useBrainstormChecklistQuery(selectedChat?.id, "active");
    const [openPanelId, setOpenPanelId] = useState<string | null>(null);
    const createMutation = useCreateChatMutation();
    const { setCurrentTool } = useStoryContext();
    const { data: templates = [] } = useChatTemplatesQuery();
    // Same query ChatList already runs internally — needed here too to resolve which WB chat a
    // pending "Rework in chat" request (from the description field / a Codex row) should bind to.
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "worldbuilding");
    const pendingRework = usePendingRework();

    const mostRecentChat = (candidates: AIChat[]): AIChat =>
        [...candidates].sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())[0];

    // Auto-restore this entry's own most-recently-updated WB chat on (re)mount — e.g. switching
    // tools/tabs and coming back to this entry — instead of always dropping back to the template
    // picker even when this entry already has chats (mirrors OutlineChatRail/NotesChatRail's own
    // story-wide auto-select, scoped to this entry's chats only since WB chats are anchored per
    // entry). Only fires once entryId is known — a brand-new unsaved entry has no chats yet, so
    // the template picker is still the correct first-open state.
    useEffect(() => {
        if (selectedChat || chatsLoading || !entryId) return;
        const candidates = chats.filter(chat => chat.anchorEntryId === entryId);
        if (candidates.length > 0) setSelectedChat(mostRecentChat(candidates));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chats, chatsLoading, selectedChat, entryId]);

    // Bridges a lorebook-field "Rework in chat" click (LorebookReworkButton.tsx) into this panel
    // via pendingReworkStore — mirrors EditorChatRail.tsx's find-or-create-on-rework effect, which
    // WB never had before (it always required picking a template manually). Finds a WB chat
    // already anchored to this entry and reuses it (most recently updated, if several); creates
    // one if none exist (P0.4 R4).
    useEffect(() => {
        if (!pendingRework || pendingRework.panel !== "worldbuilding" || pendingRework.storyId !== storyId || chatsLoading) return;
        const request = consumePendingRework();
        if (!request) return;

        const payload: InitialReworkPayload = {
            target: request.target,
            packet: request.packet,
            initialInstruction: request.initialInstruction
        };

        const candidates = chats.filter(chat => chat.anchorEntryId === request.anchorId);
        if (candidates.length === 0) {
            createMutation.mutate(
                { storyId, chatType: "worldbuilding", title: `Rework ${new Date().toLocaleString()}`, anchorEntryId: request.anchorId },
                {
                    onSuccess: newChat => {
                        setSelectedChat(newChat);
                        setInitialRework({ chatId: newChat.id, payload });
                    }
                }
            );
            return;
        }

        const mostRecent = [...candidates].sort(
            (a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime()
        )[0];
        if (candidates.length > 1) toast.info(`Continuing in "${mostRecent.title}"`);
        setSelectedChat(mostRecent);
        setInitialRework({ chatId: mostRecent.id, payload });
    }, [pendingRework, storyId, chats, chatsLoading, createMutation]);

    // Titled "{entry name} {n}" (n = this entry's existing WB chat count + 1) rather than just the
    // template name — a rail with several WB chats used to render as an indistinguishable wall of
    // "Character Codex"/"Character Codex"/"Character Codex" since the template name alone carries
    // no per-entry or per-chat identity. This is only the creation-time placeholder: once the
    // chat's first exchange completes, useChatMessageGeneration.ts's auto-title pass replaces it
    // with a real content-derived (still entry-prefixed) name, unless the user renames it first.
    // Falls back to the bare template name only in the (rare) case an entry genuinely has no name yet.
    const handleCreateFromTemplate = async (templateSlug: WorldBuildingTemplateSlug, templateName: string) => {
        const ensuredEntry = entryId ? entry : await onEnsureEntry();
        const anchorEntryId = entryId ?? ensuredEntry!.id;
        const anchoredCount = chats.filter(c => c.anchorEntryId === anchorEntryId).length;
        const title = ensuredEntry?.name ? `${ensuredEntry.name} ${anchoredCount + 1}` : templateName;
        createMutation.mutate(
            { storyId, chatType: "worldbuilding", templateSlug, title, anchorEntryId },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
    };

    // Brainstorm's "Handoff → World-Building" (BrainstormChecklistTray.tsx's handleOpenHandoff) —
    // auto-starts a WB chat on the template matching the handoff's category and seeds its
    // composer with the handoff's paste-ready detail text, so this lands ready-to-send like
    // Outline/Notes/Research already do via pendingChatComposerSeed.
    //
    // Two-phase because a brand-new entry has no entryId yet: phase 1 (entryId undefined) only
    // calls onEnsureEntry() to create the stub — that fires onEntryCreated, which promotes the
    // "new" tab into a real "entry" tab (LorebookPage.tsx) and REMOUNTS this whole panel, wiping
    // any selectedChat/composerSeedText this instance would otherwise set. Phase 2 fires on that
    // fresh mount, now with a real entryId, and actually creates+selects the chat — consumed once
    // per seed *object* (tracked by reference, not a one-shot boolean) so switching chats
    // afterward can never re-trigger the same seed, but a genuinely new seed arriving later for an
    // entry that already has a chat open (e.g. useLorebookPendingHandoffs.ts's dedupe-reuse path,
    // which re-seeds an already-open entry tab) still spawns its own new chat instead of silently
    // no-op'ing because *some* chat happened to already be selected. entryId's onEnsureEntry is
    // itself idempotent (ensureLiveEntry returns the existing liveEntry once set), so phase 1 can
    // never double-create the entry even if this instance briefly re-renders before unmounting.
    const consumedSeedRef = useRef<WorldBuildingSeed | null>(null);
    useEffect(() => {
        if (!initialWorldBuildingSeed || initialWorldBuildingSeed === consumedSeedRef.current) return;
        if (!entryId) {
            void onEnsureEntry();
            return;
        }
        consumedSeedRef.current = initialWorldBuildingSeed;
        const template = getTemplate(initialWorldBuildingSeed.templateSlug);
        const templateName = template?.defaultTitle ?? "World-Building";
        const anchoredCount = chats.filter(c => c.anchorEntryId === entryId).length;
        createMutation.mutate(
            {
                storyId,
                chatType: "worldbuilding",
                templateSlug: initialWorldBuildingSeed.templateSlug,
                title: entry?.name ? `${entry.name} ${anchoredCount + 1}` : templateName,
                anchorEntryId: entryId
            },
            {
                onSuccess: newChat => {
                    setSelectedChat(newChat);
                    setComposerSeedText(initialWorldBuildingSeed.composerText);
                    onWorldBuildingSeedConsumed?.();
                }
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once entryId becomes real, guarded by the ref above
    }, [initialWorldBuildingSeed, entryId]);

    // P0.4 B5 — WB's guided-start style + Character template's opt-in psych module. Picking
    // Grill-me on a Character-template chat also nudges the psych toggle on in the same request
    // (design doc's "Grill-me defaults psych module ON") — a one-time nudge, not a lock; the
    // toggle stays independently user-adjustable afterward.
    const isCharacterTemplate = selectedChat?.templateSlug === "character_codex";
    const handleStyleChange = (style: ChatStyle) => {
        if (!selectedChat) return;
        const data: Parameters<typeof chatsApi.update>[1] = { wbStyle: style };
        if (style === "grill" && isCharacterTemplate) data.includePsychModule = true;
        void chatsApi.update(selectedChat.id, data).then(setSelectedChat);
    };
    // Replaces the old persistent "Psych module" toggle (user feedback 2026-07-25: it wasn't
    // working as intended as a standing switch). One click arms includePsychModule (still needed
    // server-side so the model knows the psych-proposal fence format) and seeds the composer with
    // an explicit, user-authored prompt — a deliberate one-shot action instead of an always-on mode.
    const handleAddPsychPrompt = () => {
        if (!selectedChat) return;
        setComposerSeedText(PSYCH_PROMPT_TEXT);
        if (!selectedChat.includePsychModule) void chatsApi.update(selectedChat.id, { includePsychModule: true }).then(setSelectedChat);
    };
    // Exact sibling of handleAddPsychPrompt above (docs/Sexuality_Playbook_Design.md) — one click
    // arms includeSexualityModule and seeds the composer. Deliberately never wired into
    // handleStyleChange above (unlike psych's grill auto-nudge) — always an explicit opt-in.
    const handleAddSexualityPrompt = () => {
        if (!selectedChat) return;
        setComposerSeedText(SEXUALITY_PROMPT_TEXT);
        if (!selectedChat.includeSexualityModule)
            void chatsApi.update(selectedChat.id, { includeSexualityModule: true }).then(setSelectedChat);
    };
    // Character Guided Playbook Packs (Hybrid D) — arm toggle (design doc §3). Only ever offered
    // for the Character template, same gate as psych module.
    const handleTogglePlaybookPack = (checked: boolean) => {
        if (!selectedChat) return;
        void chatsApi.update(selectedChat.id, { usePlaybookPack: checked }).then(setSelectedChat);
    };
    // Guided setup arms the playbook pack unconditionally for Character chats (design doc §3's
    // click sequence: "Set usePlaybookPack = true (arm)" — not just on Grill, unlike the psych
    // nudge above which only fires for Grill).
    const handleGuidedSetup = (style: ChatStyle) => {
        setComposerSeedText(WB_OPENING_LINES[style]);
        if (selectedChat && isCharacterTemplate) void chatsApi.update(selectedChat.id, { usePlaybookPack: true }).then(setSelectedChat);
    };

    const renderTemplatePicker = () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="gradient" size="sm" className="flex items-center gap-1">
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {templates.map(template => (
                    <DropdownMenuItem
                        key={template.slug}
                        onSelect={() => void handleCreateFromTemplate(template.slug, template.name)}
                    >
                        {template.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex h-full border-l">
            <div className="relative flex-1 h-full min-h-0 min-w-0 flex flex-col">
                {selectedChat ? (
                    // min-h-0 is load-bearing here, not decorative — without it this flex-1 child
                    // can't shrink below its content's height, so a long reply grows the whole
                    // column instead of scrolling internally, pushing the composer out of view
                    // below the fold.
                    <div className="flex-1 min-h-0">
                        <ChatInterface
                            storyId={storyId}
                            promptType="worldbuilding"
                            selectedChat={selectedChat}
                            onChatUpdate={setSelectedChat}
                            initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                            initialComposerText={composerSeedText}
                            onEntryUpdated={onEntryUpdated}
                            contextToggles={contextToggles}
                            contextPanelMode="external"
                            contextSelection={contextSelection}
                            storyContextPanelMode="external"
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <Sparkles className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Pick a template to start a focused world-building session.</p>
                        {renderTemplatePicker()}
                    </div>
                )}
            </div>

            {/* Single toggle now — ChatList's own collapse control (below), driven by this same
                railCollapsed state via the collapsed/onCollapsedChange props, same pattern as
                NotesChatRail.tsx/OutlineChatRail.tsx/BrainstormTool.tsx. Previously this div was
                conditionally unmounted AND ChatList rendered its own separate always-on toggle,
                so two overlapping buttons sat at the same boundary. Always rendered now (never
                conditionally unmounted) so ChatList's toggle stays clickable to re-expand; width
                collapses to 0 instead. */}
            <div
                className={cn(
                    "flex flex-col shrink-0 transition-all duration-300",
                    railCollapsed ? "w-0" : "w-[300px]"
                )}
            >
                <ChatList
                    storyId={storyId}
                    chatType="worldbuilding"
                    title="World-Building Chats"
                    emptyLabel="No world-building chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderTemplatePicker}
                    side="right"
                    collapsed={railCollapsed}
                    onCollapsedChange={setRailCollapsed}
                    hideToggle
                />
            </div>

            {/* T10 CR7 (final host) — Approvals (Codex+Shuttle trays) and Context & memory as
                ChatToolsRail modal panels, plus the Chats primitive above
                (docs/Chat_Chrome_Declutter_Design.md). Guided Setup (psych prompt/Open Playbooks/
                playbook-pack toggle above) deliberately stays inline — CR5 not yet done on any host. */}
            <ChatToolsRail
                collapsed={toolsRailCollapsed}
                onToggleCollapsed={() => setToolsRailCollapsed(c => !c)}
                chatsOpen={!railCollapsed}
                onToggleChats={() => setRailCollapsed(!railCollapsed)}
                openPanelId={openPanelId}
                onTogglePanel={id => setOpenPanelId(cur => (cur === id ? null : id))}
                onClosePanel={() => setOpenPanelId(null)}
                panels={[
                    // Entry-scoped, not chat-scoped — available regardless of whether a WB chat is
                    // selected, unlike Approvals/Context/Playbook below which all need selectedChat.
                    ...(entry?.id
                        ? [
                              {
                                  id: "scribble",
                                  icon: NotebookPen,
                                  label: "Scribble",
                                  title: "Scribble",
                                  // Shortcut only — opens the same right-side Sheet the entry
                                  // form's own "Scribble" button opens (LorebookEntryEditor.tsx's
                                  // shared scribbleOpen state), not this rail's bottom Drawer.
                                  onClick: onOpenScribble
                              }
                          ]
                        : []),
                    ...(selectedChat
                        ? [
                              {
                                  id: "approvals",
                                  icon: Inbox,
                                  label: "Approvals",
                                  title: "Approvals",
                                  content: (
                                      <div className="space-y-0">
                                          <CodexProposalTray chatId={selectedChat.id} />
                                          <ShuttleTray
                                              chatId={selectedChat.id}
                                              storyId={storyId}
                                              fromDesk={selectedChat.chatType ?? "worldbuilding"}
                                              fromChatTitleSnapshot={selectedChat.title}
                                              onAnswerHere={setComposerSeedText}
                                          />
                                      </div>
                                  ),
                                  badge: (() => {
                                      const count = pendingCodexProposals.length + activeShuttleItems.length;
                                      return count > 0 ? (
                                          <Badge variant="secondary" className="font-normal ml-2">
                                              {count} pending
                                          </Badge>
                                      ) : undefined;
                                  })(),
                                  compactBadge: (() => {
                                      const count = pendingCodexProposals.length + activeShuttleItems.length;
                                      return count > 0 ? (
                                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                                              {count}
                                          </span>
                                      ) : undefined;
                                  })()
                              },
                              {
                                  id: "context",
                                  icon: SlidersHorizontal,
                                  label: "Context",
                                  title: "Context & memory",
                                  content: (
                                      <ChatContextPanelContent selectedChat={selectedChat} promptType="worldbuilding" toggles={contextToggles} />
                                  ),
                                  badge:
                                      contextToggles.armedLabels.length > 0 ? (
                                          <Badge variant="secondary" className="font-normal ml-2">
                                              {contextToggles.armedLabels.join(" · ")}
                                          </Badge>
                                      ) : undefined
                              },
                              {
                                  id: "story-context",
                                  icon: Library,
                                  label: "Story Context",
                                  title: "Story Context",
                                  content: (
                                      <ContextSelector
                                          includeFullContext={contextSelection.includeFullContext}
                                          contextOpen={contextSelection.contextOpen}
                                          selectedSummaries={contextSelection.selectedSummaries}
                                          selectedItems={contextSelection.selectedItems}
                                          selectedChapterContent={contextSelection.selectedChapterContent}
                                          chapters={chapters}
                                          lorebookEntries={lorebookEntries}
                                          onToggleFullContext={contextSelection.toggleFullContext}
                                          onToggleContextOpen={contextSelection.toggleContextOpen}
                                          onToggleSummary={contextSelection.toggleSummary}
                                          onItemSelect={handleContextItemSelect}
                                          onRemoveItem={contextSelection.removeItem}
                                          onChapterContentSelect={contextSelection.addChapterContent}
                                          onRemoveChapterContent={contextSelection.removeChapterContent}
                                          getFilteredEntries={getFilteredEntries}
                                          hideHeader
                                      />
                                  ),
                                  badge: contextSelection.includeFullContext ? (
                                      <Badge variant="secondary" className="font-normal ml-2">
                                          Full context
                                      </Badge>
                                  ) : (
                                      (() => {
                                          const count =
                                              contextSelection.selectedSummaries.length +
                                              contextSelection.selectedItems.length +
                                              contextSelection.selectedChapterContent.length;
                                          return count > 0 ? (
                                              <Badge variant="secondary" className="font-normal ml-2">
                                                  {count} items
                                              </Badge>
                                          ) : undefined;
                                      })()
                                  )
                              },
                              {
                                  id: "playbook",
                                  icon: Wand2,
                                  label: "Playbook",
                                  title: "Guided setup",
                                  content: (
                                      <div className="space-y-2">
                                          <GuidedSetupControl
                                              style={(selectedChat.wbStyle as ChatStyle) ?? "standard"}
                                              onStyleChange={handleStyleChange}
                                              blurb={`Develop this ${getTemplate(selectedChat.templateSlug as WorldBuildingTemplateSlug)?.name ?? "entry"} together — or run Guided setup for a structured interview.`}
                                              onGuidedSetup={handleGuidedSetup}
                                              extraToggles={
                                                  isCharacterTemplate
                                                      ? [
                                                            {
                                                                key: "playbook-pack",
                                                                label: "Use playbook pack",
                                                                checked: selectedChat.usePlaybookPack ?? false,
                                                                onChange: handleTogglePlaybookPack
                                                            }
                                                        ]
                                                      : undefined
                                              }
                                          />
                                          {isCharacterTemplate && (
                                              <div className="flex items-center gap-3">
                                                  <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-auto py-1 text-xs"
                                                      onClick={handleAddPsychPrompt}
                                                  >
                                                      Add psych prompt
                                                  </Button>
                                                  <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-auto py-1 text-xs"
                                                      onClick={handleAddSexualityPrompt}
                                                  >
                                                      Add sexuality prompt
                                                  </Button>
                                                  <Button
                                                      variant="link"
                                                      size="sm"
                                                      className="h-auto p-0 text-xs"
                                                      onClick={() => setCurrentTool("playbooks")}
                                                  >
                                                      Open Playbooks
                                                  </Button>
                                              </div>
                                          )}
                                      </div>
                                  )
                              }
                          ]
                        : [])
                ]}
            />
        </div>
    );
}

// The entry form + docked World-Building chat, with no opinion on what contains it — reused by
// CreateEntryDialog (wrapped in a Sheet) and LorebookEntryTab (rendered full-width as tab
// content), so the two presentations can never drift apart.
//
// No reset-on-prop-change effect here on purpose: `useForm`'s `defaultValues` only apply at
// construction time, so both callers key this component on entry identity (LorebookEntryTab) or
// on open-transition (CreateEntryDialog) to force a fresh mount — and therefore fresh defaults —
// instead of fighting react-hook-form's mount-time-only defaults with an effect.
export function LorebookEntryEditor({
    storyId,
    seriesId,
    entry,
    defaultCategory,
    draftValues,
    initialWorldBuildingSeed,
    onWorldBuildingSeedConsumed,
    onSaved,
    onCancel,
    onEntryCreated
}: LorebookEntryEditorProps) {
    const createMutation = useCreateLorebookMutation();
    const updateMutation = useUpdateLorebookMutation();
    const queryClient = useQueryClient();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const isDesktop = useIsDesktopViewport();
    // T5 FS5 — the map/notes cross-desk lanes SheetSyncCrossDeskCard renders only ever live in this
    // one Sync response (nothing persists them server-side the way a codexPendingChanges row or a
    // pending timeline pin does), so they're lifted here rather than owned inside SheetSyncButton
    // itself — same reasoning CodexPendingChangesPanel's own independent query doesn't need.
    const [crossDeskResult, setCrossDeskResult] = useState<SyncSheetResult | null>(null);

    // Tracks the real backing entry once one exists — starts as `entry` (already-saved case),
    // but for a brand-new entry (entry undefined) gets populated the first time the docked WB
    // chat needs to anchor to something (see ensureLiveEntry). Reading this instead of the raw
    // `entry` prop everywhere below is what lets a chat-created stub actually become "the" entry
    // being edited, instead of an orphaned duplicate the open form never learns about.
    const [liveEntry, setLiveEntry] = useState<LorebookEntry | undefined>(entry);

    // Scribble's Sheet lives once here (not inside a button component) so both entry points — the
    // form-row button below and the WB chat rail's "Scribble" icon (WorldBuildingChatPanel, a
    // sibling render in this same component's return) — open the exact same right-side panel
    // instead of each spawning its own. The rail icon is a plain shortcut (ChatToolsRail's
    // onClick escape hatch), not a bottom drawer like Approvals/Context/Playbook.
    const [scribbleOpen, setScribbleOpen] = useState(false);

    const { data: story } = useStoryQuery(storyId || "");
    const { data: seriesList } = useSeriesQuery();

    const form = useForm<CreateEntryForm>({
        defaultValues: getDefaultFormValues(entry, seriesId, storyId, defaultCategory, draftValues)
    });

    const selectedLevel = form.watch("level");
    const tagInput = form.watch("tags");
    const selectedCategory = form.watch("category");
    const nameValue = form.watch("name");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);

    // Lore Sheet (T5 FS1) — if the user switches category on a still-untouched auto-seeded sheet
    // (matches the previous category's own empty template exactly), reseed to the new category's
    // template instead of leaving stale/mismatched headings around. Never touches a sheet the
    // user has actually written into — this only fires when sheetBody === the prior seed verbatim.
    const [previousCategory, setPreviousCategory] = useState(selectedCategory);
    useEffect(() => {
        if (selectedCategory === previousCategory) return;
        const currentSheet = form.getValues("sheetBody");
        if (currentSheet === buildEmptySheetSeed(previousCategory as LorebookCategory)) {
            form.setValue("sheetBody", buildEmptySheetSeed(selectedCategory as LorebookCategory));
        }
        setPreviousCategory(selectedCategory);
    }, [selectedCategory, previousCategory, form]);

    // Lazily creates a codex-enabled stub entry from whatever the form currently holds, so a WB
    // chat started before the user has ever hit Create still has a real entryId to anchor to
    // (an unanchored chat can only ever emit "new_entry" proposals, which silently spawn a
    // second, disconnected entry on approval). Idempotent — later calls just return liveEntry.
    const ensureLiveEntry = async (): Promise<LorebookEntry> => {
        if (liveEntry) return liveEntry;

        const values = form.getValues();
        const dataToSubmit = buildSubmitData(values, undefined);
        const newId = randomUUID();
        const created = await createMutation.mutateAsync({
            id: newId,
            ...dataToSubmit,
            name: dataToSubmit.name || "Untitled Character",
            needsFleshingOut: true,
            storyId: storyId || values.scopeId || ""
        } as Omit<LorebookEntry, "createdAt">);

        await codexApi.enable(created.id, { sourceType: "user" });
        // Awaited (not fire-and-forget) so the entries list a caller's onEntryCreated relies on
        // (e.g. LorebookPage promoting this tab to "entry") already includes this stub by the
        // time it fires, instead of racing an in-flight refetch.
        await queryClient.invalidateQueries({ queryKey: lorebookKeys.all });

        const withCodex: LorebookEntry = { ...created, codexEnabled: true, needsFleshingOut: true };
        setLiveEntry(withCodex);
        onEntryCreated?.(withCodex);
        return withCodex;
    };

    // Fires immediately on "Generate from Description" instead of deferring to form submit like
    // Upload/Remove still do — there's no real reason to wait once an entry has a real id, and a
    // brand-new one gets it via the same lazy-create path ensureLiveEntry already established for
    // starting a WB chat before Create is clicked. See ImageUploadField.tsx.
    const handleGenerateImage = async (preset: "mood" | "map") => {
        setIsGeneratingImage(true);
        const [error, updated] = await attemptPromise(async () => {
            const current = liveEntry ?? (await ensureLiveEntry());
            return lorebookApi.generateImage(current.id, preset);
        });
        setIsGeneratingImage(false);
        if (error) toastCRUD.saveError("image", error);
        else setLiveEntry(updated);
    };

    // The docked WB chat's sheet-proposal Accept writes sheetBody straight to the server (bypassing
    // this form entirely, same as ensureLiveEntry's own direct-write precedent above) — this is the
    // form's only chance to learn about it while both stay mounted. Skips the field if the user has
    // it mid-edit (dirty) so an in-flight Accept from the chat can never clobber unsaved typing.
    const handleEntryUpdatedFromChat = (updated: LorebookEntry) => {
        setLiveEntry(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
        if (!form.formState.dirtyFields.sheetBody) form.setValue("sheetBody", updated.sheetBody ?? "");
    };

    const handleSubmit = async (data: CreateEntryForm) => {
        setIsSubmitting(true);
        const [error] = await attemptPromise(async () => {
            const dataToSubmit = buildSubmitData(data, liveEntry);
            const entryId = liveEntry?.id ?? randomUUID();

            if (liveEntry) await updateMutation.mutateAsync({ id: liveEntry.id, data: dataToSubmit });
            else {
                const created = await createMutation.mutateAsync({
                    id: entryId,
                    ...dataToSubmit,
                    storyId: storyId || data.scopeId || ""
                } as Omit<LorebookEntry, "createdAt">);
                // 2026-08-15 QA-pass B20 — a brand-new entry (no lazy WB-chat stub already
                // created via ensureLiveEntry above) used to leave the caller with nothing to
                // open, so Create silently dropped back to whichever tab/view was open before.
                // Same "promote this tab to the real entry" signal ensureLiveEntry already sends.
                setLiveEntry(created);
                onEntryCreated?.(created);
            }

            // Codex state is submitted separately (codexApi), not part of the base entry
            // payload above — see CodexStateEditor.tsx and CreateEntryForm's own doc comment.
            if (data.codexEnabled) {
                if (!liveEntry?.codexEnabled) await codexApi.enable(entryId, { sourceType: "user" });

                const codexStateChanged =
                    JSON.stringify(data.codexState) !== JSON.stringify(liveEntry?.codexState ?? EMPTY_CODEX_STATE);
                if (codexStateChanged)
                    await codexApi.recordState(entryId, { changes: { codexState: data.codexState }, sourceType: "user" });
            }

            // Upload/Remove are still submitted separately here, same reasoning as codex state
            // above — see ImageUploadField.tsx and CreateEntryForm's imageFile doc comment.
            // Generation itself no longer goes through submit at all (handleGenerateImage fires
            // immediately on click). Each of these returns the updated entry (new imageFilename)
            // — apply it to liveEntry so the preview picks up the new/removed image immediately,
            // without needing a manual page reload.
            if (data.imageFile instanceof File) setLiveEntry(await lorebookApi.uploadImage(entryId, data.imageFile));
            else if (data.imageFile === null) setLiveEntry(await lorebookApi.removeImage(entryId));

            // Clear the deferred imageFile field now that it's been applied — otherwise
            // ImageUploadField keeps showing a stale File preview after a successful save.
            if (data.imageFile !== undefined) form.setValue("imageFile", undefined, { shouldDirty: false });

            onSaved?.();
        });
        setIsSubmitting(false);
        if (error) toastCRUD.saveError("entry", error);
    };

    const isPending = createMutation.isPending || updateMutation.isPending || isSubmitting;
    const showChatPanel = isDesktop && !!storyId;

    return (
        <div className="flex h-full overflow-hidden">
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: "Name is required" }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <ImageUploadField
                            control={form.control}
                            setValue={form.setValue}
                            entryId={liveEntry?.id}
                            hasExistingImage={!!liveEntry?.imageFilename}
                            imageFilename={liveEntry?.imageFilename}
                            isLocation={selectedCategory === "location"}
                            onGenerateImage={handleGenerateImage}
                            isGeneratingImage={isGeneratingImage}
                        />

                        {/* Sheet-first default surface (T5 FS1) — replaces the retired Natural View
                            toggle. Structured/machine fields (category, tags, importance, raw
                            description, raw Codex state, level/scope) moved into Advanced below. */}
                        <LoreSheetEditor control={form.control} category={selectedCategory} entryId={liveEntry?.id} storyId={storyId} />

                        <div className="flex justify-end gap-2">
                            <ExtractPinsButton control={form.control} category={selectedCategory} entryId={liveEntry?.id} />
                            <SheetSyncButton
                                control={form.control}
                                category={selectedCategory}
                                entryId={liveEntry?.id}
                                onSynced={setCrossDeskResult}
                            />
                        </div>

                        {/* T5 FS5 — ephemeral map-layout-brief / notes-stub cards, cleared on
                            Apply/Create or explicit Dismiss (see crossDeskResult's own comment). */}
                        <SheetSyncCrossDeskCard
                            entry={liveEntry}
                            storyId={storyId}
                            result={crossDeskResult}
                            onDismiss={() => setCrossDeskResult(null)}
                        />

                        {/* User-facing action buttons, not machine chrome — kept visible without
                            opening Advanced (moved out of RawEntryFields, T5 FS1). */}
                        {selectedCategory === "location" && liveEntry?.id && storyId && (
                            <OpenMapButton storyId={storyId} locationId={liveEntry.id} locationName={nameValue || "Untitled location"} />
                        )}
                        {liveEntry?.id && storyId && (
                            <PlaceOnTimelineButton
                                storyId={storyId}
                                linkType="lorebook"
                                linkId={liveEntry.id}
                                defaultTitle={nameValue || "Untitled entry"}
                            />
                        )}
                        {liveEntry?.id && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setScribbleOpen(true)}>
                                <NotebookPen className="h-4 w-4 mr-2" />
                                Scribble
                            </Button>
                        )}

                        {/* T5 FS3 — gate loosened from codexEnabled to just liveEntry.id: Sync now
                            proposes into this same tray for every category (not just
                            Codex-enabled character/location entries), and the panel already
                            renders nothing when there's nothing pending — zero visual cost for
                            entries that never receive a proposal. */}
                        {liveEntry?.id && (
                            <CodexPendingChangesPanel entryId={liveEntry.id} storyId={storyId} currentState={liveEntry.codexState} />
                        )}

                        {liveEntry?.codexEnabled && liveEntry.id && <CodexHistoryPanel entryId={liveEntry.id} storyId={storyId} />}

                        {liveEntry?.category === "character" && liveEntry.id && <PsychProfilePanel entry={liveEntry} />}
                        {liveEntry?.category === "character" && liveEntry.id && <SexualityProfilePanel entry={liveEntry} />}

                        <AdvancedSettings control={form.control} open={advancedOpen} onOpenChange={setAdvancedOpen}>
                            <LevelScopeFields
                                control={form.control}
                                setValue={form.setValue}
                                selectedLevel={selectedLevel}
                                storyId={storyId}
                                story={story}
                                seriesList={seriesList}
                            />
                            <RawEntryFields
                                control={form.control}
                                tagInput={tagInput}
                                selectedCategory={selectedCategory}
                                entryId={liveEntry?.id}
                                storyId={storyId}
                            />
                        </AdvancedSettings>

                        <div className="flex justify-end gap-3">
                            {onCancel && (
                                <Button type="button" variant="outline" onClick={onCancel}>
                                    Cancel
                                </Button>
                            )}
                            <Button type="submit" disabled={isPending}>
                                {isPending ? "Saving..." : liveEntry ? "Update" : "Create"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>

            {showChatPanel && (
                // 420px was sized for the chat interface alone; it now docks the World-Building
                // Chats list (a fixed 300px, see ChatList.tsx) alongside it, which left only
                // ~120px for the interface itself once min-w-0 (below) stopped it from silently
                // overflowing off-screen. Widened to give the interface real breathing room.
                <div className="w-[680px] shrink-0 h-full">
                    <WorldBuildingChatPanel
                        storyId={storyId as string}
                        entryId={liveEntry?.id}
                        entry={liveEntry}
                        onEnsureEntry={ensureLiveEntry}
                        onEntryUpdated={handleEntryUpdatedFromChat}
                        onOpenScribble={() => setScribbleOpen(true)}
                        initialWorldBuildingSeed={initialWorldBuildingSeed}
                        onWorldBuildingSeedConsumed={onWorldBuildingSeedConsumed}
                    />
                </div>
            )}

            <Sheet open={scribbleOpen} onOpenChange={setScribbleOpen}>
                <SheetContent side="right" className="h-[100vh] w-full sm:w-[540px] md:w-[700px] lg:w-[800px] sm:max-w-full">
                    <SheetHeader>
                        <SheetTitle>Scribble</SheetTitle>
                    </SheetHeader>
                    <div className="overflow-y-auto h-[100vh]">
                        {scribbleOpen && liveEntry?.id && <LorebookScribbleContent entry={liveEntry} storyId={storyId} />}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
