import { useCallback, useState } from "react";

const STORAGE_KEY = "sn-lorebook-browse-view";
const SMART_DEFAULT_THRESHOLD = 12;

export type LorebookBrowseView = "cards" | "list";

const readStored = (): LorebookBrowseView | null => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "cards" || raw === "list" ? raw : null;
};

/**
 * Global (all-stories-share-one) Cards|List preference for Lorebook Browse. While no pref is
 * stored, the view recomputes from the current category's entry count each render (List at
 * >= 12); once the user toggles, the explicit choice is stored and wins regardless of count.
 */
export function useLorebookBrowseView(
    categoryEntryCount: number
): [LorebookBrowseView, (view: LorebookBrowseView) => void] {
    const [stored, setStored] = useState<LorebookBrowseView | null>(readStored);

    const setView = useCallback((view: LorebookBrowseView) => {
        window.localStorage.setItem(STORAGE_KEY, view);
        setStored(view);
    }, []);

    const view = stored ?? (categoryEntryCount >= SMART_DEFAULT_THRESHOLD ? "list" : "cards");
    return [view, setView];
}
