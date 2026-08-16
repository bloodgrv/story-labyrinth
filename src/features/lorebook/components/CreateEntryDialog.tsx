import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { LorebookEntryEditor } from "./LorebookEntryEditor";
import type { LorebookCategory } from "./form";
import { LevelBadge } from "./LevelBadge";

interface CreateEntryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storyId?: string;
    seriesId?: string;
    entry?: LorebookEntry;
    defaultCategory?: LorebookCategory;
    // Pre-fills a brand-new entry's name/category/description — used by the document-import
    // flow and, since P0.4 R8, the Outline chat's "Open in WB" lore-suggestion handoff (see
    // LorebookPage.tsx's pendingLorebookSeed consumption). Ignored when `entry` is set.
    draftValues?: DocumentImportDraft;
    // 2026-08-15 QA-pass B20 — lets the caller open the new entry as its own tab once Create
    // actually saves it, instead of just closing this sheet back to whatever was open before.
    onEntryCreated?: (entry: LorebookEntry) => void;
}

// Thin Sheet shell around LorebookEntryEditor (form + docked World-Building chat) — see
// LorebookEntryEditor.tsx for why the editor itself has no reset-on-reopen effect. Keyed on
// open-transition + entry identity so every time this Sheet opens (fresh "New Entry" click,
// or a different entry to edit) the form mounts fresh instead of carrying over stale state
// from the previous time it was open.
export function CreateEntryDialog({
    open,
    onOpenChange,
    storyId,
    seriesId,
    entry,
    defaultCategory,
    draftValues,
    onEntryCreated
}: CreateEntryDialogProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="h-[100vh] w-full sm:max-w-full lg:w-[1100px] xl:w-[1300px] p-0 flex flex-col overflow-hidden"
            >
                <SheetHeader className="p-6 pb-0">
                    <SheetTitle>
                        <div className="flex items-center gap-2">
                            {entry ? "Edit Entry" : "Create New Entry"}
                            {entry && <LevelBadge level={entry.level} />}
                        </div>
                    </SheetTitle>
                </SheetHeader>
                <div className="flex-1 min-h-0">
                    <LorebookEntryEditor
                        key={`${open}-${entry?.id ?? "new"}`}
                        storyId={storyId}
                        seriesId={seriesId}
                        entry={entry}
                        defaultCategory={defaultCategory}
                        draftValues={draftValues}
                        onSaved={() => onOpenChange(false)}
                        onCancel={() => onOpenChange(false)}
                        onEntryCreated={onEntryCreated}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
