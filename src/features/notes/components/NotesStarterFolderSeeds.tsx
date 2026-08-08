import { FolderPlus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateFolderMutation } from "@/features/folders/hooks/useFoldersQuery";

const SEED_NAMES = ["Research", "Continuity", "Scene scraps", "Promotions", "Archive"];
const dismissKey = (storyId: string) => `notes-starter-seeds-dismissed:${storyId}`;

// Dismissible starter-folder offer (T7, docs/Notes_Org_Browse_Design.md NO5) — shown once when a
// story has zero notes-kind folders. One click creates all five root folders, full rename/delete
// afterward like any other folder; nothing is forced onto the schema.
export function NotesStarterFolderSeeds({ storyId }: { storyId: string }) {
    const [dismissed, setDismissed] = useState(() => window.localStorage.getItem(dismissKey(storyId)) === "1");
    const createFolderMutation = useCreateFolderMutation();

    if (dismissed) return null;

    const dismiss = () => {
        window.localStorage.setItem(dismissKey(storyId), "1");
        setDismissed(true);
    };

    const createSeeds = () => {
        for (const name of SEED_NAMES) createFolderMutation.mutate({ kind: "notes", scopeId: storyId, parentId: null, name });
        dismiss();
    };

    return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <FolderPlus className="h-4 w-4 shrink-0" />
                <span className="truncate">
                    Set up starter folders (Research, Continuity, Scene scraps, Promotions, Archive)?
                </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={createSeeds}>
                    Set up
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={dismiss} title="Dismiss">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
