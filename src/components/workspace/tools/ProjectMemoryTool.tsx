import { ProjectMemoryPanel } from "@/features/agent-memory/components/ProjectMemoryPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as UsersTool.tsx for a full-page tool — the real UI lives in
// ProjectMemoryPanel. Sidebar.tsx already gates this tool behind requiresStory: true, so
// currentStoryId should always be set by the time this renders, but guard anyway.
export function ProjectMemoryTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <ProjectMemoryPanel storyId={currentStoryId} />;
}
