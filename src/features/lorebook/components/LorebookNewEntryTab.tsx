import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import type { WorldBuildingSeed } from "@/types/worldbuilding";
import type { LorebookCategory } from "./form";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface LorebookNewEntryTabProps {
    storyId?: string;
    seriesId?: string;
    defaultCategory: LorebookCategory;
    // Handoff pre-fill (Brainstorm/Outline/Name Generator's pendingLorebookSeed) — undefined for
    // the plain "New Entry" button, which starts a genuinely blank form.
    draftValues?: DocumentImportDraft;
    // Only ever set by Brainstorm's WB handoff (the one producer with paste-ready chat text) —
    // auto-starts the docked WB chat and seeds its composer. Already resolved to a template slug
    // by LorebookPage.tsx's openNewEntryTabWithSeed. See LorebookEntryEditor.tsx's
    // WorldBuildingChatPanel; must be forwarded unchanged to onEntryCreated's tab-promotion below
    // (LorebookPage.tsx carries it across the draft->real-entry remount).
    initialWorldBuildingSeed?: WorldBuildingSeed;
    onSaved: () => void;
    onCancel: () => void;
    // Fires the first time the docked WB chat lazily creates this draft's backing stub entry —
    // see LorebookEntryEditor.tsx's ensureLiveEntry. The parent (LorebookPage) uses this to
    // promote the tab from "new" to a real "entry" tab.
    onEntryCreated?: (entry: LorebookEntry) => void;
}

// Full-width tab content for a brand-new entry (the Browse tab's "New Entry" button, or a
// pendingLorebookSeed handoff) — same LorebookEntryEditor as LorebookEntryTab/
// LorebookImportDraftTab. Was previously a slide-in Sheet (CreateEntryDialog); moved to a tab so
// "New Entry" matches the same open-as-tab pattern every other Lorebook entry point already uses
// (click a card, open a document-import draft) — handoffs now share that same tab path too.
export function LorebookNewEntryTab({
    storyId,
    seriesId,
    defaultCategory,
    draftValues,
    initialWorldBuildingSeed,
    onSaved,
    onCancel,
    onEntryCreated
}: LorebookNewEntryTabProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                <h2 className="text-lg font-semibold">New Entry</h2>
            </div>
            <div className="flex-1 min-h-0">
                <LorebookEntryEditor
                    storyId={storyId}
                    seriesId={seriesId}
                    defaultCategory={defaultCategory}
                    draftValues={draftValues}
                    initialWorldBuildingSeed={initialWorldBuildingSeed}
                    onSaved={onSaved}
                    onCancel={onCancel}
                    onEntryCreated={onEntryCreated}
                />
            </div>
        </div>
    );
}
