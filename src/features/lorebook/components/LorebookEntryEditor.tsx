import { attemptPromise } from "@jfdi/attempt";
import { Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { ChatInterface } from "@/features/chat/components/ChatInterface";
import { ChatList } from "@/features/chat/components/ChatList";
import { CodexProposalTray } from "@/features/chat/components/CodexProposalTray";
import { GuidedSetupControl } from "@/features/chat/components/GuidedSetupControl";
import { useChatsByStoryQuery, useChatTemplatesQuery, useCreateChatMutation } from "@/features/chat/hooks/useChatQuery";
import { consumePendingRework, type InitialReworkPayload, usePendingRework } from "@/features/rework/pendingReworkStore";
import { useSeriesQuery } from "@/features/series/hooks/useSeriesQuery";
import { useStoryQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";
import { useNaturalEntryView } from "@/lib/useNaturalEntryView";
import { codexApi, lorebookApi, chatsApi } from "@/services/api/client";
import type { DocumentImportDraft } from "@/types/codex";
import type { AIChat, LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";
import { toastCRUD } from "@/utils/toastUtils";
import type { ChatStyle, WorldBuildingTemplateSlug } from "@/types/worldbuilding";
import { getTemplate } from "@/types/worldbuilding";
import { useCreateLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { PsychProfilePanel } from "./PsychProfilePanel";
import {
    AdvancedSettings,
    CodexHistoryPanel,
    CodexPendingChangesPanel,
    EMPTY_CODEX_STATE,
    ImageUploadField,
    LevelScopeFields,
    NaturalEntryView,
    RawEntryFields,
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
}

// Docked World-Building chat alongside the entry form — the same chat/template-picker
// composition the old standalone World-Building tool used (now folded in here, see D1/D2 in
// DECISIONS.md), reusing ChatList/ChatInterface rather than a new per-entry chat.
// `entryId` (when editing an existing entry) anchors new chats created here to it — see
// DECISIONS.md's chat-context-anchoring entry and chatContextService.ts's getChatContext.
// Naturally undefined for a brand-new not-yet-saved entry, which just means new chats aren't
// anchored, no special-casing needed.
function WorldBuildingChatPanel({ storyId, entryId }: { storyId: string; entryId?: string }) {
    const [selectedChat, setSelectedChat] = useState<AIChat | null>(null);
    const [initialRework, setInitialRework] = useState<{ chatId: string; payload: InitialReworkPayload } | null>(null);
    const [composerSeedText, setComposerSeedText] = useState<string | null>(null);
    const createMutation = useCreateChatMutation();
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

    const handleCreateFromTemplate = (templateSlug: WorldBuildingTemplateSlug, templateName: string) => {
        createMutation.mutate(
            { storyId, chatType: "worldbuilding", templateSlug, title: templateName, anchorEntryId: entryId ?? null },
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
    const handleTogglePsychModule = (checked: boolean) => {
        if (!selectedChat) return;
        void chatsApi.update(selectedChat.id, { includePsychModule: checked }).then(setSelectedChat);
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
                    <DropdownMenuItem key={template.slug} onClick={() => handleCreateFromTemplate(template.slug, template.name)}>
                        {template.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div className="flex h-full border-l">
            <div className="flex-1 h-full min-h-0 min-w-0 flex flex-col">
                {selectedChat && (
                    <div className="p-3 pb-0">
                        <GuidedSetupControl
                            style={(selectedChat.wbStyle as ChatStyle) ?? "standard"}
                            onStyleChange={handleStyleChange}
                            blurb={`Develop this ${getTemplate(selectedChat.templateSlug as WorldBuildingTemplateSlug)?.name ?? "entry"} together — or run Guided setup for a structured interview.`}
                            onGuidedSetup={style => setComposerSeedText(WB_OPENING_LINES[style])}
                            extraToggle={
                                isCharacterTemplate
                                    ? { label: "Psych module", checked: selectedChat.includePsychModule ?? false, onChange: handleTogglePsychModule }
                                    : undefined
                            }
                        />
                    </div>
                )}
                {selectedChat ? (
                    <ChatInterface
                        storyId={storyId}
                        promptType="worldbuilding"
                        selectedChat={selectedChat}
                        onChatUpdate={setSelectedChat}
                        initialRework={initialRework?.chatId === selectedChat.id ? initialRework.payload : null}
                        initialComposerText={composerSeedText}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full flex-col gap-4 text-muted-foreground p-4">
                        <Sparkles className="h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm text-center max-w-xs">Pick a template to start a focused world-building session.</p>
                        {renderTemplatePicker()}
                    </div>
                )}
            </div>

            <div className="flex flex-col w-[300px] shrink-0">
                <ChatList
                    storyId={storyId}
                    chatType="worldbuilding"
                    title="World-Building Chats"
                    emptyLabel="No world-building chats yet"
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    renderNewChatAction={renderTemplatePicker}
                    side="right"
                />
                {/* Was inline ProposalCard rendering only, Approve/Reject with no Edit — moved to
                    the same tray Editor chats use (P0.4 R4 scope decision #1) so rework turns get
                    edit-before-approve too, not just Editor's. See ChatInterface.tsx's
                    usesCodexTray. */}
                {selectedChat && <CodexProposalTray chatId={selectedChat.id} />}
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
    onCancel
}: LorebookEntryEditorProps) {
    const createMutation = useCreateLorebookMutation();
    const updateMutation = useUpdateLorebookMutation();
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [naturalView, setNaturalView] = useNaturalEntryView();
    const isDesktop = useIsDesktopViewport();

    const { data: story } = useStoryQuery(storyId || "");
    const { data: seriesList } = useSeriesQuery();

    const form = useForm<CreateEntryForm>({
        defaultValues: getDefaultFormValues(entry, seriesId, storyId, defaultCategory, draftValues)
    });

    const selectedLevel = form.watch("level");
    const tagInput = form.watch("tags");
    const selectedCategory = form.watch("category");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (data: CreateEntryForm) => {
        setIsSubmitting(true);
        const [error] = await attemptPromise(async () => {
            const dataToSubmit = buildSubmitData(data);
            const entryId = entry?.id ?? randomUUID();

            if (entry) await updateMutation.mutateAsync({ id: entry.id, data: dataToSubmit });
            else
                await createMutation.mutateAsync({
                    id: entryId,
                    ...dataToSubmit,
                    storyId: storyId || data.scopeId || ""
                } as Omit<LorebookEntry, "createdAt">);

            // Codex state is submitted separately (codexApi), not part of the base entry
            // payload above — see CodexStateEditor.tsx and CreateEntryForm's own doc comment.
            if (data.codexEnabled) {
                if (!entry?.codexEnabled) await codexApi.enable(entryId, { sourceType: "user" });

                const codexStateChanged =
                    JSON.stringify(data.codexState) !== JSON.stringify(entry?.codexState ?? EMPTY_CODEX_STATE);
                if (codexStateChanged)
                    await codexApi.recordState(entryId, { changes: { codexState: data.codexState }, sourceType: "user" });
            }

            // Image is submitted separately too, same reasoning — see ImageUploadField.tsx and
            // CreateEntryForm's imageFile/generateImageOnSave doc comments.
            if (data.imageFile instanceof File) await lorebookApi.uploadImage(entryId, data.imageFile);
            else if (data.imageFile === null) await lorebookApi.removeImage(entryId);
            else if (data.generateImageOnSave) await lorebookApi.generateImage(entryId);

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
                        {!naturalView && (
                            <LevelScopeFields
                                control={form.control}
                                setValue={form.setValue}
                                selectedLevel={selectedLevel}
                                storyId={storyId}
                                story={story}
                                seriesList={seriesList}
                            />
                        )}

                        <ImageUploadField
                            control={form.control}
                            setValue={form.setValue}
                            entryId={entry?.id}
                            hasExistingImage={!!entry?.imageFilename}
                        />

                        {naturalView ? (
                            <NaturalEntryView control={form.control} entryId={entry?.id} storyId={storyId} />
                        ) : (
                            <RawEntryFields
                                control={form.control}
                                tagInput={tagInput}
                                selectedCategory={selectedCategory}
                                entryId={entry?.id}
                                storyId={storyId}
                            />
                        )}

                        {entry?.codexEnabled && entry.id && <CodexPendingChangesPanel entryId={entry.id} storyId={storyId} />}

                        {entry?.codexEnabled && entry.id && <CodexHistoryPanel entryId={entry.id} storyId={storyId} />}

                        {entry?.category === "character" && entry.id && <PsychProfilePanel entry={entry} />}

                        <AdvancedSettings
                            control={form.control}
                            open={advancedOpen}
                            onOpenChange={setAdvancedOpen}
                            naturalView={naturalView}
                            onNaturalViewChange={setNaturalView}
                        />

                        <div className="flex justify-end gap-3">
                            {onCancel && (
                                <Button type="button" variant="outline" onClick={onCancel}>
                                    Cancel
                                </Button>
                            )}
                            <Button type="submit" disabled={isPending}>
                                {isPending ? "Saving..." : entry ? "Update" : "Create"}
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
                    <WorldBuildingChatPanel storyId={storyId as string} entryId={entry?.id} />
                </div>
            )}
        </div>
    );
}
