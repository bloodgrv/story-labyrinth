import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useStoryContext, type WorkspaceTool } from "@/features/stories/context/StoryContext";

const VALID_TOOLS: readonly WorkspaceTool[] = [
    "stories",
    "series",
    "editor",
    "chapters",
    "outline",
    "lorebook",
    "brainstorm",
    "research",
    "notes",
    "users",
    "memory",
    "relationships"
];

// Consume `?story=&tool=` query params on mount (e.g. a deep link from a Dashboard card
// opened in a new tab) and apply them, then strip them from the URL. The URL is the single
// source of truth for the deep link — this avoids racing the localStorage persistence
// effects in StoryContext, which only run in whichever tab called setCurrentStoryId/Tool.
export function useWorkspaceDeepLink(): void {
    const [searchParams, setSearchParams] = useSearchParams();
    const { setCurrentStoryId, setCurrentTool } = useStoryContext();

    useEffect(() => {
        const story = searchParams.get("story");
        const tool = searchParams.get("tool");
        if (!story && !tool) return;

        if (story) setCurrentStoryId(story);
        if (tool && VALID_TOOLS.includes(tool as WorkspaceTool)) setCurrentTool(tool as WorkspaceTool);

        setSearchParams({}, { replace: true });
        // Deliberately run once on mount only — this consumes the initial deep link,
        // it must not re-fire as searchParams/context setters change identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
