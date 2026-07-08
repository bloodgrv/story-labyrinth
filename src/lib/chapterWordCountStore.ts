import { useSyncExternalStore } from "react";

// A tiny cross-component live word count, keyed by chapterId and written to by every mounted
// WordCountPlugin instance (one per open editor pane). `ToolbarContext`'s own wordCount lives
// scoped to a single Lexical composer tree, which is exactly right for the toolbar itself but
// unreachable from a session HUD that renders outside any one pane's component tree — this store
// is the bridge, without threading pane/context plumbing through everything in between.
// Same useSyncExternalStore + module-level Map pattern as useAutoDetectBeats.ts, generalized from
// a single boolean to a per-key value.

const counts = new Map<string, number>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const reportChapterWordCount = (chapterId: string, count: number): void => {
    counts.set(chapterId, count);
    listeners.forEach(listener => listener());
};

export const useChapterWordCount = (chapterId: string | null): number =>
    useSyncExternalStore(
        subscribe,
        () => (chapterId ? (counts.get(chapterId) ?? 0) : 0),
        () => 0
    );

// Plain (non-hook) read for use outside React render — e.g. snapshotting the starting word count
// the instant a focus session begins.
export const getChapterWordCount = (chapterId: string | null): number =>
    (chapterId ? counts.get(chapterId) : undefined) ?? 0;
