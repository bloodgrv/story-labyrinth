import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type WorkspaceTool =
    | "stories"
    | "series"
    | "editor"
    | "chapters"
    | "outline"
    | "lorebook"
    | "brainstorm"
    | "prompts"
    | "notes";

interface StoryContextType {
    currentStoryId: string | null;
    currentChapterId: string | null;
    currentTool: WorkspaceTool;
    setCurrentStoryId: (storyId: string | null) => void;
    setCurrentChapterId: (chapterId: string | null) => void;
    setCurrentTool: (tool: WorkspaceTool) => void;
    resetContext: () => void;
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
                resetContext
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
