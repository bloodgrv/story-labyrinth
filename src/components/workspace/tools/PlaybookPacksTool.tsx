import { PlaybookPacksPanel } from "@/features/playbooks/components/PlaybookPacksPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as ProjectMemoryTool.tsx — the real UI lives in PlaybookPacksPanel.
// Sidebar.tsx already gates this tool behind requiresStory: true, so currentStoryId should
// always be set by the time this renders, but guard anyway.
export function PlaybookPacksTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return (
        <div className="p-6 max-w-4xl mx-auto space-y-4">
            <PlaybookPacksPanel storyId={currentStoryId} />
        </div>
    );
}
