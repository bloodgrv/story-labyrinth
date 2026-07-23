import type { LorebookCategory } from "./form";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface LorebookNewEntryTabProps {
    storyId?: string;
    seriesId?: string;
    defaultCategory: LorebookCategory;
    onSaved: () => void;
    onCancel: () => void;
}

// Full-width tab content for a brand-new entry (the Browse tab's "New Entry" button) — same
// LorebookEntryEditor as LorebookEntryTab/LorebookImportDraftTab, just with no entry and no
// draft seed, only a starting category. Was previously a slide-in Sheet (CreateEntryDialog);
// moved to a tab so "New Entry" matches the same open-as-tab pattern every other Lorebook entry
// point already uses (click a card, open a document-import draft).
export function LorebookNewEntryTab({ storyId, seriesId, defaultCategory, onSaved, onCancel }: LorebookNewEntryTabProps) {
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
                    onSaved={onSaved}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
}
