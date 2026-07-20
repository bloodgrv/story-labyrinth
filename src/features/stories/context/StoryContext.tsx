import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { LorebookEntry } from "@/types/story";

export type WorkspaceTool =
    | "stories"
    | "series"
    | "editor"
    | "chapters"
    | "outline"
    | "lorebook"
    | "brainstorm"
    | "notes"
    | "users"
    | "research"
    | "memory"
    | "relationships"
    | "scanner";

interface StoryContextType {
    currentStoryId: string | null;
    currentChapterId: string | null;
    currentTool: WorkspaceTool;
    setCurrentStoryId: (storyId: string | null) => void;
    setCurrentChapterId: (chapterId: string | null) => void;
    setCurrentTool: (tool: WorkspaceTool) => void;
    resetContext: () => void;
    // Ephemeral, one-shot cross-tool navigation pointer (Relationships graph -> Lorebook "open
    // entry"). Deliberately NOT localStorage-persisted, unlike every other field here — it only
    // needs to survive the single setCurrentTool("lorebook") re-render that follows it.
    pendingLorebookEntryId: string | null;
    setPendingLorebookEntryId: (id: string | null) => void;
    // Same posture as pendingLorebookEntryId above, for the Outline chat's "Open in WB" lore-
    // suggestion handoff (P0.4 R8) — a suggested new entity's seed content, consumed once by
    // LorebookPage to pre-fill CreateEntryDialog, then cleared.
    pendingLorebookSeed: { name: string; category: LorebookEntry["category"]; blurb: string } | null;
    setPendingLorebookSeed: (seed: { name: string; category: LorebookEntry["category"]; blurb: string } | null) => void;
    // Generalized version of the same one-shot pattern, for Brainstorm's "Handoff → Outline/
    // Research" tray actions (P0.4 B0-B4) — the WB handoff destination keeps reusing
    // pendingLorebookSeed above unchanged (same shape a lore-suggestion already produces); this
    // covers destinations with no structured pre-fill dialog of their own, where "handoff" just
    // means "switch to that tool and prefill its chat composer with this text."
    pendingChatComposerSeed: { tool: WorkspaceTool; text: string } | null;
    setPendingChatComposerSeed: (seed: { tool: WorkspaceTool; text: string } | null) => void;
    // Bumped whenever a chapter's content changes from OUTSIDE the live editor's own autosave
    // loop (currently: History drawer restore, P0.2b) — LoadChapterContentPlugin's own "only
    // load once per chapterId" gate has no other way to learn the DB content changed out from
    // under it, since chapters has no updatedAt column to diff against. A plain counter, not a
    // boolean, so re-triggering with the editor already showing the same chapterId still fires
    // the effect (a boolean set back to its own value wouldn't).
    chapterContentRefreshToken: number;
    refreshChapterContent: () => void;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

const STORAGE_KEY_STORY_ID = "workspace-last-story-id";
const STORAGE_KEY_TOOL = "workspace-current-tool";
const CHAPTER_KEY = (storyId: string) => `workspace-chapter-id-${storyId}`;

export function StoryProvider({ children }: { children: ReactNode }) {
    // Initialize from localStorage
    const [currentStoryId, setCurrentStoryIdState] = useState<string | null>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_STORY_ID);
        return stored || null;
    });

    const [currentChapterId, setCurrentChapterIdState] = useState<string | null>(() => {
        const storedStoryId = localStorage.getItem(STORAGE_KEY_STORY_ID);
        if (!storedStoryId) return null;
        return localStorage.getItem(CHAPTER_KEY(storedStoryId)) || null;
    });

    const [pendingLorebookEntryId, setPendingLorebookEntryId] = useState<string | null>(null);
    const [pendingLorebookSeed, setPendingLorebookSeed] = useState<StoryContextType["pendingLorebookSeed"]>(null);
    const [pendingChatComposerSeed, setPendingChatComposerSeed] = useState<StoryContextType["pendingChatComposerSeed"]>(null);
    const [chapterContentRefreshToken, setChapterContentRefreshToken] = useState(0);
    const refreshChapterContent = () => setChapterContentRefreshToken(token => token + 1);

    const [currentTool, setCurrentToolState] = useState<WorkspaceTool>(() => {
        const storedStoryId = localStorage.getItem(STORAGE_KEY_STORY_ID);
        const stored = localStorage.getItem(STORAGE_KEY_TOOL) as WorkspaceTool;
        // If no story, default to 'stories' tool
        if (!storedStoryId) return "stories";
        // Otherwise use stored or default to 'editor'
        return stored || "editor";
    });

    // Persist currentStoryId to localStorage
    useEffect(() => {
        if (currentStoryId) localStorage.setItem(STORAGE_KEY_STORY_ID, currentStoryId);
        else localStorage.removeItem(STORAGE_KEY_STORY_ID);
    }, [currentStoryId]);

    // Persist currentChapterId to localStorage under a per-story key.
    // Only write, never delete — deletion would erase the key when switching stories.
    useEffect(() => {
        if (!currentStoryId || !currentChapterId) return;
        localStorage.setItem(CHAPTER_KEY(currentStoryId), currentChapterId);
    }, [currentChapterId, currentStoryId]);

    // Persist currentTool to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_TOOL, currentTool);
    }, [currentTool]);

    const setCurrentChapterId = (chapterId: string | null) => {
        setCurrentChapterIdState(chapterId);
    };

    const setCurrentStoryId = (storyId: string | null) => {
        setCurrentStoryIdState(storyId);
        // Restore the last chapter for the selected story (per-story persistence)
        const restoredChapter = storyId ? localStorage.getItem(CHAPTER_KEY(storyId)) || null : null;
        setCurrentChapterIdState(restoredChapter);
        // When story selected, switch to editor tool
        if (storyId && currentTool === "stories") setCurrentToolState("editor");
        // When story cleared, switch to stories tool
        if (!storyId) setCurrentToolState("stories");
    };

    const setCurrentTool = (tool: WorkspaceTool) => {
        setCurrentToolState(tool);
    };

    const resetContext = () => {
        setCurrentStoryIdState(null);
        setCurrentChapterId(null);
        setCurrentToolState("stories");
    };

    return (
        <StoryContext.Provider
            value={{
                currentStoryId,
                currentChapterId,
                currentTool,
                setCurrentStoryId,
                setCurrentChapterId,
                setCurrentTool,
                resetContext,
                pendingLorebookEntryId,
                setPendingLorebookEntryId,
                pendingLorebookSeed,
                setPendingLorebookSeed,
                pendingChatComposerSeed,
                setPendingChatComposerSeed,
                chapterContentRefreshToken,
                refreshChapterContent
            }}
        >
            {children}
        </StoryContext.Provider>
    );
}

export function useStoryContext() {
    const context = useContext(StoryContext);
    if (!context) throw new Error("useStoryContext must be used within a StoryProvider");

    return context;
}
