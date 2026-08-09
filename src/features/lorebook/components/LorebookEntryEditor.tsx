import { attemptPromise } from "@jfdi/attempt";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { GuidedSetupControl } from "@/features/chat/components/GuidedSetupControl";
import { ShuttleTray } from "@/features/chat/components/ShuttleTray";
import { useChatsByStoryQuery, useChatTemplatesQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
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
import type { ChatStyle, WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { getTemplate } from "@/types/worldbuilding";
import { lorebookKeys, useCreateLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { PsychProfilePanel } from "./PsychProfilePanel";
import type { SyncSheetResult } from "@/services/api/lorebookClient";
import {
    AdvancedSettings,
    CodexHistoryPanel,
    CodexPendingChangesPanel,
    EMPTY_CODEX_STATE,
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

export interface LorebookEntryEditorProps {
    storyId?: string;
    seriesId?: string;
    entry?: LorebookEntry;
    defaultCategory?: LorebookCategory;
    // Seeds a brand-new entry from an AI document-import extraction — see entryFormUtils.ts's
    // getDefaultFormValues. Ignored when `entry` is set (editing always wins over a draft).
    draftValues?: DocumentImportDraft;
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
    onEnsureEntry
}: {
    storyId: string;
    entryId?: string;
    onEnsureEntry: () => Promise<LorebookEntry>;
}) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    // ChatList's own built-in collapse toggle only shrinks itself — CodexProposalTray/ShuttleTray
    // are siblings inside the same fixed-width column, not inside ChatList, so that toggle alone
    // can't reclaim the column's width once a chat (and therefore the trays) is selected. This is
    // a second, outer toggle that hides the whole column — same pattern as EditorChatRail's own
    // "Show/Hide Editor Chats" toggle.
    const [railCollapsed, setRailCollapsed] = useState(false);
    const createMutation = useCreateChatMutation();
    const { setCurrentTool } = useStoryContext();
    const { data: templates = [] } = useChatTemplatesQuery();
    // Same query ChatList already runs internally — needed here too to resolve which WB chat a
    // pending "Rework in chat" request (from the description field / a Codex row) should bind to.
    const { data: chats = [], isLoading: chatsLoading } = useChatsByStoryQuery(storyId, "worldbuilding");
    const pendingRework = usePendingRework();

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

    const handleCreateFromTemplate = async (templateSlug: WorldBuildingTemplateSlug, templateName: string) => {
        const anchorEntryId = entryId ?? (await onEnsureEntry()).id;
        createMutation.mutate(
            { storyId, chatType: "worldbuilding", templateSlug, title: templateName, anchorEntryId },
            { onSuccess: newChat => setSelectedChat(newChat) }
        );
    };

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
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {templates.map(template => (
                    <DropdownMenuItem
                        key={template.slug}
                        onClick={() => void handleCreateFromTemplate(template.slug, template.name)}
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
                            guidedSetup={
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
                            }
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
                />
                {/* Was inline ProposalCard rendering only, Approve/Reject with no Edit — moved to
                    the same tray Editor chats use (P0.4 R4 scope decision #1) so rework turns get
                    edit-before-approve too, not just Editor's. See ChatInterface.tsx's
                    usesCodexTray. Not rendered while collapsed — same reasoning as
                    NotesChatRail.tsx's own tray. */}
                {selectedChat && !railCollapsed && <CodexProposalTray chatId={selectedChat.id} />}
                {selectedChat && !railCollapsed && (
                    <ShuttleTray
                        chatId={selectedChat.id}
                        storyId={storyId}
                        fromDesk={selectedChat.chatType ?? "worldbuilding"}
                        fromChatTitleSnapshot={selectedChat.title}
                        onAnswerHere={setComposerSeedText}
                    />
                )}
            </div>
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

    const handleSubmit = async (data: CreateEntryForm) => {
        setIsSubmitting(true);
        const [error] = await attemptPromise(async () => {
            const dataToSubmit = buildSubmitData(data, liveEntry);
            const entryId = liveEntry?.id ?? randomUUID();

            if (liveEntry) await updateMutation.mutateAsync({ id: liveEntry.id, data: dataToSubmit });
            else
                await createMutation.mutateAsync({
                    id: entryId,
                    ...dataToSubmit,
                    storyId: storyId || data.scopeId || ""
                } as Omit<LorebookEntry, "createdAt">);

            // Codex state is submitted separately (codexApi), not part of the base entry
            // payload above — see CodexStateEditor.tsx and CreateEntryForm's own doc comment.
            if (data.codexEnabled) {
                if (!liveEntry?.codexEnabled) await codexApi.enable(entryId, { sourceType: "user" });

                const codexStateChanged =
                    JSON.stringify(data.codexState) !== JSON.stringify(liveEntry?.codexState ?? EMPTY_CODEX_STATE);
                if (codexStateChanged)
                    await codexApi.recordState(entryId, { changes: { codexState: data.codexState }, sourceType: "user" });
            }

            // Image is submitted separately too, same reasoning — see ImageUploadField.tsx and
            // CreateEntryForm's imageFile/generateImageOnSave doc comments. Each of these returns
            // the updated entry (new imageFilename) — apply it to liveEntry so the preview picks
            // up the new/removed image immediately, without needing a manual page reload.
            if (data.imageFile instanceof File) setLiveEntry(await lorebookApi.uploadImage(entryId, data.imageFile));
            else if (data.imageFile === null) setLiveEntry(await lorebookApi.removeImage(entryId));
            else if (data.generateImageOnSave)
                setLiveEntry(await lorebookApi.generateImage(entryId, data.generateImagePreset));

            // Clear the deferred image fields now that they've been applied — otherwise
            // ImageUploadField keeps showing "Will generate a new image..." (or a stale File
            // preview) after a successful save.
            if (data.imageFile !== undefined || data.generateImageOnSave) {
                form.setValue("imageFile", undefined, { shouldDirty: false });
                form.setValue("generateImageOnSave", false, { shouldDirty: false });
            }

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
                        />

                        {/* Sheet-first default surface (T5 FS1) — replaces the retired Natural View
                            toggle. Structured/machine fields (category, tags, importance, raw
                            description, raw Codex state, level/scope) moved into Advanced below. */}
                        <LoreSheetEditor control={form.control} category={selectedCategory} />

                        <div className="flex justify-end">
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
                    <WorldBuildingChatPanel storyId={storyId as string} entryId={liveEntry?.id} onEnsureEntry={ensureLiveEntry} />
                </div>
            )}
        </div>
    );
}
