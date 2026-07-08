import { useSyncExternalStore } from "react";

const STORAGE_KEY = "autoDetectBeats";

const listeners = new Set<() => void>();

const readValue = (): boolean => window.localStorage.getItem(STORAGE_KEY) === "true";

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

export const setAutoDetectBeats = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    notify();
};

/**
 * Persistent, cross-component "auto-detect beats on save" toggle (localStorage-backed, off by
 * default — background AI detection costs API calls on every quiet pause in editing, so it's
 * opt-in rather than on by default).
 */
export const useAutoDetectBeats = (): [boolean, (value: boolean) => void] => {
    const value = useSyncExternalStore(subscribe, () => cachedValue, () => false);
    return [value, setAutoDetectBeats];
};
