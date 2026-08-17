import { useSyncExternalStore } from "react";
import type { WorkspaceTool } from "@/features/stories/context/StoryContext";

export interface AiActivityEntry {
    id: string;
    label: string;
    storyId?: string;
    // Omitted entirely (not approximated) when there's no reliable place to land — mirrors
    // jobPresentation.ts's JOB_TYPE_JUMP_TOOL precedent (e.g. a WB chat is entry-anchored inside
    // Lorebook with no pointer to the right entry from here).
    tool?: WorkspaceTool;
    startedAt: number;
}

// Plain module-level registry (not a React store) for live/streaming AI generation — chat sends,
// Editor Selection-Generate/Rework, chapter summary generation. Deliberately a sibling of
// AIService (src/services/ai/AIService.ts), not folded into it: AIService is the actual HTTP/
// streaming client and has no idea which chat/feature is calling it, while every real caller here
// already knows a meaningful label (chat title, "Selection rework", etc.) at the point it starts
// generating — so callers register themselves directly instead of AIService guessing.
//
// Being a plain module (not component state) means begin/end calls made from inside an
// already-in-flight async function keep working correctly even if the calling component unmounts
// mid-generation (switching tool/story away from an open chat) — the exact gap this exists to close.
const entries = new Map<string, AiActivityEntry>();
const listeners = new Set<() => void>();
let cachedSnapshot: AiActivityEntry[] = [];

const notify = () => {
    cachedSnapshot = Array.from(entries.values());
    listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const beginAiActivity = (entry: Omit<AiActivityEntry, "id" | "startedAt">): string => {
    const id = crypto.randomUUID();
    entries.set(id, { ...entry, id, startedAt: Date.now() });
    notify();
    return id;
};

export const endAiActivity = (id: string): void => {
    if (!entries.delete(id)) return;
    notify();
};

export const useAiActivity = (): AiActivityEntry[] =>
    useSyncExternalStore(subscribe, () => cachedSnapshot, () => []);
