import { useSyncExternalStore } from "react";

const STORAGE_KEY = "naturalEntryView";

const listeners = new Set<() => void>();

const readValue = (): boolean => window.localStorage.getItem(STORAGE_KEY) !== "false";

let cachedValue = readValue();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const notify = () => {
    cachedValue = readValue();
    listeners.forEach(listener => listener());
};

window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) notify();
});

export const setNaturalEntryView = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    notify();
};

/**
 * Persistent, cross-component "Natural (Prose) View" toggle for the Lorebook entry editor
 * (localStorage-backed, defaults to on).
 */
export const useNaturalEntryView = (): [boolean, (value: boolean) => void] => {
    const value = useSyncExternalStore(subscribe, () => cachedValue, () => true);
    return [value, setNaturalEntryView];
};
