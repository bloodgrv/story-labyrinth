import { NameGeneratorPanel } from "@/features/name-generator/components/NameGeneratorPanel";
import { useStoryContext } from "@/features/stories/context/StoryContext";

// Thin wrapper, same role as ProjectMemoryTool.tsx — the real UI lives in NameGeneratorPanel.
// Sidebar.tsx gates this tool behind requiresStory: true (generation is story-scoped for
// collision checking), so currentStoryId should always be set by the time this renders, but
// NameGeneratorPanel itself guards too.
export function NameGeneratorTool() {
    const { currentStoryId } = useStoryContext();
    if (!currentStoryId) return null;
    return <NameGeneratorPanel />;
}
