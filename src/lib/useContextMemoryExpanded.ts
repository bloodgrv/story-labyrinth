import { useSyncExternalStore } from "react";

const STORAGE_KEY = "contextMemoryExpanded";

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

export const setContextMemoryExpanded = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    notify();
};

/**
 * Chat Model Routing / chrome density (CC0, docs/Chat_Model_Routing_And_Chrome_Design.md) —
 * global, cross-chat "Context & memory" disclosure state. Collapsed by default (C2); the toggle
 * *values* underneath stay per-chat server fields as before, only this expand/collapse UI state
 * is a global localStorage flag.
 */
export const useContextMemoryExpanded = (): [boolean, (value: boolean) => void] => {
    const value = useSyncExternalStore(subscribe, () => cachedValue, () => false);
    return [value, setContextMemoryExpanded];
};
