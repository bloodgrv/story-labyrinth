import { useEffect } from "react";
import { toast } from "react-toastify";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { LorebookEntry } from "@/types/story";

// Consumes two one-shot StoryContext handoff pointers for LorebookPage — the Relationships
// graph's "open entry" pointer (pendingLorebookEntryId) and the Outline/Brainstorm/Name-Generator
// "Open in WB" seed (pendingLorebookSeed) — mirroring useWorkspaceDeepLink.ts's own
// one-shot-on-mount pattern. Extracted out of LorebookPage.tsx to keep that file under the
// project's max-lines limit once Folders (B9) added more state there.
export function useLorebookPendingHandoffs(params: {
    entries: LorebookEntry[];
    isLoading: boolean;
    openEntryTab: (entry: LorebookEntry) => void;
    openNewEntryTabWithSeed: (seed: { name: string; category: LorebookEntry["category"]; blurb: string; detail?: string }) => void;
}): void {
    const { entries, isLoading, openEntryTab, openNewEntryTabWithSeed } = params;
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

    // Opens a pre-filled "new entry" tab (same open-as-tab pattern every other Lorebook entry
    // point uses, see LorebookNewEntryTab.tsx) instead of the old CreateEntryDialog Sheet —
    // pendingLorebookSeed is cleared in this same effect so it can't re-trigger on a later remount.
    useEffect(() => {
        if (!pendingLorebookSeed) return;
        openNewEntryTabWithSeed(pendingLorebookSeed);
        setPendingLorebookSeed(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingLorebookSeed]);
}
