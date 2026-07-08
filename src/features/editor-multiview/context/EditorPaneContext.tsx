import { createContext, type ReactNode, useContext } from "react";
import { useStoryContext } from "@/features/stories/context/StoryContext";

interface EditorPaneContextValue {
    chapterId: string;
    storyId: string;
}

const EditorPaneContext = createContext<EditorPaneContextValue | null>(null);

// Wraps a single MultiView pane's editor tree so every plugin/component beneath it resolves
// "the chapter I'm editing" to THIS pane's chapter, not the app-wide selection. Absent (outside
// MultiView, e.g. the plain single-editor path) `useEditorChapterId`/`useEditorStoryId` fall
// back to the global StoryContext, so every existing call site keeps working unchanged.
export const EditorPaneProvider = ({
    chapterId,
    storyId,
    children
}: EditorPaneContextValue & { children: ReactNode }) => (
    <EditorPaneContext.Provider value={{ chapterId, storyId }}>{children}</EditorPaneContext.Provider>
);

export const useEditorChapterId = (): string | null => {
    const paneContext = useContext(EditorPaneContext);
    const { currentChapterId } = useStoryContext();
    return paneContext ? paneContext.chapterId : currentChapterId;
};

export const useEditorStoryId = (): string | null => {
    const paneContext = useContext(EditorPaneContext);
    const { currentStoryId } = useStoryContext();
    return paneContext ? paneContext.storyId : currentStoryId;
};
