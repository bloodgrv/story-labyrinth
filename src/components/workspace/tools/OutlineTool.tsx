import { LorebookProvider } from "@/features/lorebook/context/LorebookContext";
import { OutlinePage } from "@/features/outline/components/OutlinePage";
import { useStoryContext } from "@/features/stories/context/StoryContext";

export const OutlineTool = () => {
    const { currentStoryId } = useStoryContext();

    if (!currentStoryId)
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-muted-foreground">No story selected</p>
            </div>
        );

    return (
        <LorebookProvider storyId={currentStoryId}>
            <OutlinePage storyId={currentStoryId} />
        </LorebookProvider>
    );
};
