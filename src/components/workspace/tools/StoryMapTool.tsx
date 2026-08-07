import { StoryMapCanvas } from "@/features/story-map/components/StoryMapCanvas";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// SOFT-DEPRECATED, UNREACHABLE (Maps v2 MV1/MV7, docs/Maps_V2_Sketch_Design.md decision #8) —
// nothing imports this component anymore; MainContent.tsx's "story-map" tool case renders
// MapsTool.tsx instead (see its own comment). Left on disk deliberately, not deleted — confirmed
// genuinely dead via a Vite build module-count drop when MV1 unwired it. Do not re-wire this back
// in; build against features/story-maps/ (Maps v2) instead.
//
// Thin wrapper, same role as StoryGraphTool.tsx — the real UI lives in StoryMapCanvas.
export function StoryMapTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <StoryMapCanvas storyId={currentStoryId} />;
}
