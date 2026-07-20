import { useSyncExternalStore } from "react";
import type { FocusPacket, FocusTarget } from "@/types/rework";

// Bridges the floating toolbar's "Rework in chat" / Expand-Rewrite-Shorten chips (inside a
// specific MultiView pane's Lexical composer tree) to the Editor chat rail (a sibling panel,
// outside any composer tree) — the opposite direction from activeChapterEditorStore.ts, which
// bridges chat -> editor for Accept. Same module-level-value + useSyncExternalStore idiom as
// chapterWordCountStore.ts, but CONSUME-ONCE: a rework request is a one-shot command ("open/select
// the bound chat and start a rework"), not a continuous value, so EditorChatRail reads and clears
// it the instant it acts, rather than leaving it live for every future render/remount to re-trigger.
export interface PendingReworkRequest {
    chapterId: string;
    storyId: string;
    target: FocusTarget;
    packet: FocusPacket;
    // Pre-fills (never auto-sends) the bound chat's input — used by the Expand/Rewrite/Shorten
    // chips to carry their own canned instruction; absent for the plain "Rework in chat" button.
    initialInstruction?: string;
}

let pending: PendingReworkRequest | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const requestRework = (request: PendingReworkRequest): void => {
    pending = request;
    listeners.forEach(listener => listener());
};

// For EditorChatRail to subscribe/re-render when a new request arrives.
export const usePendingRework = (): PendingReworkRequest | null =>
    useSyncExternalStore(
        subscribe,
        () => pending,
        () => null
    );

// The subset EditorChatRail hands down to ChatInterface once it's resolved which chat the
// request binds to — chapterId/storyId were only needed for chat resolution, not by the chat UI.
export type InitialReworkPayload = Pick<PendingReworkRequest, "target" | "packet" | "initialInstruction">;

// Reads and clears in one step — call exactly once, inside the effect that acts on the request,
// so a later re-render/remount doesn't replay an already-handled rework.
export const consumePendingRework = (): PendingReworkRequest | null => {
    const request = pending;
    if (request) {
        pending = null;
        listeners.forEach(listener => listener());
    }
    return request;
};
