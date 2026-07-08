export interface SessionTab {
    url: string;
    label: string;
    openedAt: string; // ISO timestamp
}

export interface StorySession {
    storyId: string;
    lastAccessed: string;
    tabs: SessionTab[];
}

export interface PreferredLayout {
    storyId: string;
    savedAt: string;
    label: string;
    tabs: Pick<SessionTab, "url" | "label">[];
}
