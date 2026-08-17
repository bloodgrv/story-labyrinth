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

// Plain module-level registry (not a React store) for foreground AI work — begin/end calls made
// from inside an already-in-flight async function keep working correctly even if the calling
// component unmounts mid-call (switching tool/story away from an open chat), which is the whole
// reason this isn't just component state. Two independent instances below: one for streaming
// generation (chat sends, Editor Selection-Generate/Rework, chapter summaries — real callers that
// already know a meaningful label/story/tool), one for one-shot AI POST endpoints (Humanizer
// rewrite, Lore Sheet Improve/Sync, Image Generation, Document/Outline Import — wired generically
// in apiFactory.ts, so no per-call-site label context, hence no storyId/tool on those entries).
function createActivityRegistry() {
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

    const begin = (entry: Omit<AiActivityEntry, "id" | "startedAt">): string => {
        const id = crypto.randomUUID();
        entries.set(id, { ...entry, id, startedAt: Date.now() });
        notify();
        return id;
    };

    const end = (id: string): void => {
        if (!entries.delete(id)) return;
        notify();
    };

    const useActivity = (): AiActivityEntry[] => useSyncExternalStore(subscribe, () => cachedSnapshot, () => []);

    return { begin, end, useActivity };
}

const streamingRegistry = createActivityRegistry();
export const beginAiActivity = streamingRegistry.begin;
export const endAiActivity = streamingRegistry.end;
export const useAiActivity = streamingRegistry.useActivity;

const oneShotRegistry = createActivityRegistry();
export const beginAiOneShot = oneShotRegistry.begin;
export const endAiOneShot = oneShotRegistry.end;
export const useAiOneShotActivity = oneShotRegistry.useActivity;
