import { StoryMapCanvas } from "@/features/story-map/components/StoryMapCanvas";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as StoryGraphTool.tsx — the real UI lives in StoryMapCanvas.
export function StoryMapTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <StoryMapCanvas storyId={currentStoryId} />;
}
