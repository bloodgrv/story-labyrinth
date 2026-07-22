import { useEffect } from "react";
import { toast } from "react-toastify";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { EMPTY_CODEX_STATE } from "../components/form";

// Consumes two one-shot StoryContext handoff pointers for LorebookPage — the Relationships
// graph's "open entry" pointer (pendingLorebookEntryId) and the Outline chat's "Open in WB"
// lore-suggestion seed (pendingLorebookSeed) — mirroring useWorkspaceDeepLink.ts's own
// one-shot-on-mount pattern. Extracted out of LorebookPage.tsx to keep that file under the
// project's max-lines limit once Folders (B9) added more state there.
export function useLorebookPendingHandoffs(params: {
    entries: LorebookEntry[];
    isLoading: boolean;
    openEntryTab: (entry: LorebookEntry) => void;
    setActiveDraftSeed: (draft: DocumentImportDraft) => void;
    setIsCreateDialogOpen: (open: boolean) => void;
}): void {
    const { entries, isLoading, openEntryTab, setActiveDraftSeed, setIsCreateDialogOpen } = params;
    const { pendingLorebookEntryId, setPendingLorebookEntryId, pendingLorebookSeed, setPendingLorebookSeed } = useStoryContext();

    // Guarded on isLoading since `entries` starts empty on first mount right after a tool switch.
    useEffect(() => {
        if (!pendingLorebookEntryId || isLoading) return;
        const entry = entries.find(e => e.id === pendingLorebookEntryId);
        if (entry) openEntryTab(entry);
        else toast.error("That entry could not be found");
        setPendingLorebookEntryId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingLorebookEntryId, isLoading, entries]);

    // The seed is copied into local state (activeDraftSeed, owned by LorebookPage) rather than
    // read directly from context at render time — pendingLorebookSeed is cleared in this same
    // effect (so it can't re-trigger the dialog on a later remount), but CreateEntryDialog still
    // needs the value as a prop on the render(s) that follow, after it's already null in context.
    useEffect(() => {
        if (!pendingLorebookSeed) return;
        setActiveDraftSeed({
            name: pendingLorebookSeed.name,
            category: pendingLorebookSeed.category,
            description: pendingLorebookSeed.blurb,
            tags: [],
            codexState: EMPTY_CODEX_STATE,
            image: null
        });
        setIsCreateDialogOpen(true);
        setPendingLorebookSeed(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingLorebookSeed]);
}
