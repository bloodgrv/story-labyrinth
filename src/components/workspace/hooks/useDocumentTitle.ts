import { useEffect } from "react";
import { TOOL_LABELS } from "@/components/workspace/toolLabels";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";

// Sets the browser tab title to "Story Nexus - <Tool>" (e.g. "Story Nexus - Editor") so tabs
// opened via Sidebar.tsx's "New tab" picker — or any tab, really — are distinguishable in the
// browser's tab strip instead of all reading the static "The Story Nexus" from index.html.
export function useDocumentTitle(): void {
    const { currentTool, currentStoryId } = useStoryContext();
    const { data: stories } = useStoriesQuery();

    useEffect(() => {
        const toolLabel = TOOL_LABELS[currentTool] ?? currentTool;
        const story = stories?.find(s => s.id === currentStoryId);
        document.title = story ? `Story Nexus - ${toolLabel} - ${story.title}` : `Story Nexus - ${toolLabel}`;
    }, [currentTool, currentStoryId, stories]);
}
