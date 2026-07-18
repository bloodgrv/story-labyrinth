import { RagScannerPanel } from "@/features/rag-scanner/components/RagScannerPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as ProjectMemoryTool.tsx — the real UI lives in RagScannerPanel.
// Sidebar.tsx already gates this tool behind requiresStory: true, so currentStoryId should
// always be set by the time this renders, but guard anyway.
export function RagScannerTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <RagScannerPanel storyId={currentStoryId} />;
}
