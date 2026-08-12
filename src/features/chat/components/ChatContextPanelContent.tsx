import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ChatContextToggles } from "@/features/chat/hooks/useChatContextToggles";
import type { AIChat, Prompt } from "@/types/story";

interface ChatContextPanelContentProps {
    selectedChat: AIChat;
    promptType: Prompt["promptType"];
    toggles: ChatContextToggles;
}

// The "Context & memory" switch groups — extracted out of ChatInterface.tsx (T10 CR4,
// docs/Chat_Chrome_Declutter_Design.md) so the same markup can render either inline (Collapsible,
// every host not yet migrated) or inside a ChatToolsRail modal-drawer panel (Notes first). Reads
// every value/setter from `toggles` (useChatContextToggles) rather than local state/closures —
// content and gating are otherwise byte-identical to the pre-CR4 inline block.
export function ChatContextPanelContent({ selectedChat, promptType, toggles }: ChatContextPanelContentProps) {
    const isEditorChat = promptType === "editor";
    const isOutlineChat = promptType === "outline";
    const isBrainstormChat = promptType === "brainstorm";
    const isResearchChat = promptType === "research";
    const isNotesChat = promptType === "notes";
    const { usesCodexTray, usesShuttle } = toggles;

    return (
        <div className="space-y-4 pt-3">
            {!isEditorChat && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                    {/* Include Notes (the bridge toggle) is meaningless for the Notes chat itself — it
                        already gets privileged always-on reads (allNotes/focusedNote) instead. */}
                    {!isNotesChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-notes`}
                                checked={toggles.includeNotes}
                                onCheckedChange={toggles.toggleIncludeNotes}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-notes`} className="text-sm font-normal">
                                Include Notes (working material, not canon)
                            </Label>
                        </div>
                    )}
                    {!isOutlineChat && !isResearchChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-outline`}
                                checked={toggles.includeOutline}
                                onCheckedChange={toggles.toggleIncludeOutline}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-outline`} className="text-sm font-normal">
                                Include Outline (planning intent, not canon)
                            </Label>
                        </div>
                    )}
                    {!isResearchChat && !isNotesChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-memory`}
                                checked={toggles.includeMemory}
                                onCheckedChange={toggles.toggleIncludeMemory}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-memory`} className="text-sm font-normal">
                                Include Project Memory (approved facts)
                            </Label>
                        </div>
                    )}
                    {!isResearchChat && !isNotesChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-timeline`}
                                checked={toggles.includeTimeline}
                                onCheckedChange={toggles.toggleIncludeTimeline}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-timeline`} className="text-sm font-normal">
                                Include Story Timeline (Spine chronology)
                            </Label>
                        </div>
                    )}
                    {/* Lorebook is Brainstorm/Research/Notes-only opt-in — every other chat type's
                        lorebook search stays always-on (see chatContextService.ts's entityTypes computation). */}
                    {(isBrainstormChat || isResearchChat || isNotesChat) && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-lorebook`}
                                checked={toggles.includeLorebook}
                                onCheckedChange={toggles.toggleIncludeLorebook}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-lorebook`} className="text-sm font-normal">
                                Include Lorebook
                            </Label>
                        </div>
                    )}
                    {isResearchChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-web-search`}
                                checked={toggles.webSearchEnabled}
                                onCheckedChange={toggles.toggleWebSearchEnabled}
                            />
                            <Label htmlFor={`${selectedChat.id}-web-search`} className="text-sm font-normal">
                                Web search
                            </Label>
                        </div>
                    )}
                    {isBrainstormChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-include-chapter-summaries`}
                                checked={toggles.includeChapterSummaries}
                                onCheckedChange={toggles.toggleIncludeChapterSummaries}
                            />
                            <Label htmlFor={`${selectedChat.id}-include-chapter-summaries`} className="text-sm font-normal">
                                Include Chapter Summaries
                            </Label>
                        </div>
                    )}
                </div>
            )}

            {/* Guide is available on every chat type, including Editor (which otherwise stays
                canon-only, see the !isEditorChat block above) — app-usage questions aren't story
                canon, so this doesn't need the same isolation. */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                    <Switch
                        id={`${selectedChat.id}-include-guide`}
                        checked={toggles.includeGuide}
                        onCheckedChange={toggles.toggleIncludeGuide}
                    />
                    <Label htmlFor={`${selectedChat.id}-include-guide`} className="text-sm font-normal">
                        Include Guide (app usage help)
                    </Label>
                </div>
            </div>

            {usesCodexTray && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                    {isEditorChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-auto-insert-prose`}
                                checked={toggles.autoInsertProse}
                                onCheckedChange={toggles.toggleAutoInsertProse}
                            />
                            <Label htmlFor={`${selectedChat.id}-auto-insert-prose`} className="text-sm font-normal">
                                Auto-insert prose (skip review)
                            </Label>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Switch
                            id={`${selectedChat.id}-auto-accept-codex`}
                            checked={toggles.autoAcceptCodex}
                            onCheckedChange={toggles.toggleAutoAcceptCodex}
                        />
                        <Label htmlFor={`${selectedChat.id}-auto-accept-codex`} className="text-sm font-normal">
                            Auto-accept Codex changes
                        </Label>
                    </div>
                    {isOutlineChat && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-auto-accept-outline`}
                                checked={toggles.autoAcceptOutline}
                                onCheckedChange={toggles.toggleAutoAcceptOutline}
                            />
                            <Label htmlFor={`${selectedChat.id}-auto-accept-outline`} className="text-sm font-normal">
                                Auto-accept outline changes (not delete)
                            </Label>
                        </div>
                    )}
                    {usesShuttle && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`${selectedChat.id}-auto-shuttle`}
                                checked={toggles.autoShuttle}
                                onCheckedChange={toggles.toggleAutoShuttle}
                            />
                            <Label htmlFor={`${selectedChat.id}-auto-shuttle`} className="text-sm font-normal">
                                Always-shuttle high-confidence lookups
                            </Label>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
