import { useCallback, useState } from "react";

const STORAGE_KEY = "sn-lorebook-sort-by";

export type LorebookSortOption = "name" | "category" | "importance" | "created";

const isSortOption = (value: string | null): value is LorebookSortOption =>
    value === "name" || value === "category" || value === "importance" || value === "created";

const readStored = (): LorebookSortOption => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isSortOption(raw) ? raw : "name";
};

/**
 * Global (all-stories-share-one) sort preference for the Lorebook entry list — mirrors
 * useLorebookBrowseView's own localStorage pattern so the sort choice survives switching tools/
 * tabs and reopening the app, instead of resetting to "name" on every remount.
 */
export function useLorebookSortOption(): [LorebookSortOption, (option: LorebookSortOption) => void] {
    const [sortBy, setSortByState] = useState<LorebookSortOption>(readStored);

    const setSortBy = useCallback((option: LorebookSortOption) => {
        window.localStorage.setItem(STORAGE_KEY, option);
        setSortByState(option);
    }, []);

    return [sortBy, setSortBy];
}
