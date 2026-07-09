import type { DocumentImportDraft } from "@/types/codex";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

interface LorebookImportDraftTabProps {
    draft: DocumentImportDraft;
    storyId?: string;
    seriesId?: string;
    onSaved: () => void;
}

// Full-width tab content for a document-import draft (documentImportService.ts) — same
// LorebookEntryEditor as LorebookEntryTab, just seeded from an AI extraction instead of an
// existing entry, and with no LevelBadge (a draft has no level yet — that's chosen in the
// form itself, via LevelScopeFields).
export function LorebookImportDraftTab({ draft, storyId, seriesId, onSaved }: LorebookImportDraftTabProps) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                <h2 className="text-lg font-semibold">{draft.name}</h2>
                <span className="text-xs text-muted-foreground">Imported draft — review before saving</span>
            </div>
            <div className="flex-1 min-h-0">
                <LorebookEntryEditor storyId={storyId} seriesId={seriesId} draftValues={draft} onSaved={onSaved} />
            </div>
        </div>
    );
}
