import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import LorebookPage from "@/features/lorebook/pages/LorebookPage";
import { useStoryContext } from "@/features/stories/context/StoryContext";

export const LorebookTool = () => {
    const { currentStoryId } = useStoryContext();

    if (!currentStoryId)
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No story selected</p>
            </div>
        );

    // Pass storyId as prop to LorebookPage
    // LorebookPage will fetch hierarchical entries (global + series + story)
    // LorebookProvider is required here now that CreateEntryDialog embeds the World-Building
    // ChatInterface (useLorebookContext), folded in per DECISIONS.md's D1/D2 notes.
    return (
        <LorebookProvider storyId={currentStoryId}>
            <LorebookPage storyId={currentStoryId} />
        </LorebookProvider>
    );
};
