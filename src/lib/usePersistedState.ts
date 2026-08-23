import { attempt } from "@jfdi/attempt";
import { useCallback, useState } from "react";

/**
 * Generic localStorage-backed replacement for useState — same pattern already established by
 * useLorebookBrowseView.ts/useLorebookSortOption.ts, generalized so a preference/filter/view
 * toggle can opt into persistence without hand-rolling its own read/write helpers. `isValid`
 * guards against a stale or hand-edited storage value (e.g. an enum member that got renamed).
 */
export function usePersistedState<T>(
    storageKey: string,
    defaultValue: T,
    isValid: (value: unknown) => value is T
): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(() => {
        const raw = window.localStorage.getItem(storageKey);
        if (raw === null) return defaultValue;
        const [error, parsed] = attempt(() => JSON.parse(raw));
        return !error && isValid(parsed) ? parsed : defaultValue;
    });

    const setPersisted = useCallback(
        (next: T) => {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            setValue(next);
        },
        [storageKey]
    );

    return [value, setPersisted];
}
