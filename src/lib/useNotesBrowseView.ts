import { useCallback, useState } from "react";

const STORAGE_KEY = "sn-notes-browse-view";
const SMART_DEFAULT_THRESHOLD = 12;

export type NotesBrowseView = "cards" | "list";

const readStored = (): NotesBrowseView | null => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "cards" || raw === "list" ? raw : null;
};

/**
 * Global Cards|List preference for Notes Browse — mirrors useLorebookBrowseView.ts exactly
 * (T7, docs/Notes_Org_Browse_Design.md NO2). While no pref is stored, the view recomputes from
 * the current note count each render (List at >= 12); once the user toggles, the explicit choice
 * is stored and wins regardless of count.
 */
export function useNotesBrowseView(noteCount: number): [NotesBrowseView, (view: NotesBrowseView) => void] {
    const [stored, setStored] = useState<NotesBrowseView | null>(readStored);

    const setView = useCallback((view: NotesBrowseView) => {
        window.localStorage.setItem(STORAGE_KEY, view);
        setStored(view);
    }, []);

    const view = stored ?? (noteCount >= SMART_DEFAULT_THRESHOLD ? "list" : "cards");
    return [view, setView];
}
