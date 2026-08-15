import { AiReviewPanel } from "@/features/ai-review/components/AiReviewPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as RagScannerTool.tsx — the real UI lives in AiReviewPanel.
// Sidebar.tsx already gates this tool behind requiresStory: true, so currentStoryId should
// always be set by the time this renders, but guard anyway.
export function AiReviewTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <AiReviewPanel storyId={currentStoryId} />;
}
