import type { PreferredLayout, SessionTab, StorySession } from "./types";

const SESSION_KEY = (storyId: string) => `storyLabyrinth.session.${storyId}`;
const LAYOUT_KEY = (storyId: string) => `storyLabyrinth.preferredLayout.${storyId}`;
const MAX_TABS = 12;

function readItem<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function writeItem(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Silently skip if storage quota is exceeded
    }
}

export function getSession(storyId: string): StorySession | null {
    return readItem<StorySession>(SESSION_KEY(storyId));
}

export function recordTabOpen(storyId: string, url: string, label: string): StorySession {
    const existing = getSession(storyId);
    const prev = existing?.tabs ?? [];

    // Move existing entry with the same URL to the front with a fresh timestamp
    const filtered = prev.filter(t => t.url !== url);
    const next: StorySession = {
        storyId,
        lastAccessed: new Date().toISOString(),
        tabs: [{ url, label, openedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_TABS)
    };
    writeItem(SESSION_KEY(storyId), next);
    return next;
}

export function clearSession(storyId: string): void {
    localStorage.removeItem(SESSION_KEY(storyId));
}

export function getPreferredLayout(storyId: string): PreferredLayout | null {
    return readItem<PreferredLayout>(LAYOUT_KEY(storyId));
}

export function savePreferredLayout(
    storyId: string,
    tabs: Pick<SessionTab, "url" | "label">[],
    label: string
): PreferredLayout {
    const layout: PreferredLayout = {
        storyId,
        savedAt: new Date().toISOString(),
        label,
        tabs
    };
    writeItem(LAYOUT_KEY(storyId), layout);
    return layout;
}

export function clearPreferredLayout(storyId: string): void {
    localStorage.removeItem(LAYOUT_KEY(storyId));
}
