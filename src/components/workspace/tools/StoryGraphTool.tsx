import { StoryGraphCanvas } from "@/features/story-graph/components/StoryGraphCanvas";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as ProjectMemoryTool.tsx — the real UI lives in StoryGraphCanvas.
// Sidebar.tsx already gates this tool behind requiresStory: true, so currentStoryId should
// always be set by the time this renders, but guard anyway.
export function StoryGraphTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <StoryGraphCanvas storyId={currentStoryId} />;
}
