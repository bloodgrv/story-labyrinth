import { useSyncExternalStore } from "react";

const STORAGE_KEY = "showModelThinking";

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

export const setShowModelThinking = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    notify();
};

/**
 * Persistent, cross-component "Show Model Thinking" toggle (localStorage-backed, defaults to off).
 */
export const useShowModelThinking = (): [boolean, (value: boolean) => void] => {
    const value = useSyncExternalStore(subscribe, () => cachedValue, () => false);
    return [value, setShowModelThinking];
};
