import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useChaptersByStoryQuery, useCreateChapterMutation } from "@/features/chapters/hooks/useChaptersQuery";
import { useLorebookByStoryQuery } from "@/features/lorebook/hooks/useLorebookQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { Chapter } from "@/types/story";
import { CreateChapterDialog, type CreateChapterForm } from "./tools/CreateChapterDialog";

export const ChapterSwitcher = () => {
    const { currentStoryId, currentChapterId, currentTool, setCurrentChapterId } = useStoryContext();
    const { data: chapters = [] } = useChaptersByStoryQuery(currentStoryId || "");
    const { data: lorebookEntries = [] } = useLorebookByStoryQuery(currentStoryId || "");
    const createChapterMutation = useCreateChapterMutation();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    const currentChapter = chapters.find((c: Chapter) => c.id === currentChapterId);
    const currentChapterIndex = chapters.findIndex((c: Chapter) => c.id === currentChapterId);
    const currentChapterNumber = currentChapterIndex !== -1 ? currentChapterIndex + 1 : null;
    const characterEntries = lorebookEntries.filter(entry => entry.category === "character");

    const handleCreateChapter = (data: CreateChapterForm) => {
        if (!currentStoryId) return;

        const nextOrder = chapters.length === 0 ? 1 : Math.max(...chapters.map(chapter => chapter.order ?? 0)) + 1;
        const povCharacter = data.povType !== "Third Person Omniscient" ? data.povCharacter : undefined;

        createChapterMutation.mutate(
            {
                id: "",
                storyId: currentStoryId,
                title: data.title,
                content: "",
                povCharacter,
                povType: data.povType,
                order: nextOrder,
                outline: { content: "", lastUpdated: new Date() },
                wordCount: 0
            },
            {
                onSuccess: newChapter => {
                    setIsCreateDialogOpen(false);
                    setCurrentChapterId(newChapter.id);
                }
            }
        );
    };

    // Only show for editor tool
    if (currentTool !== "editor")
        return null;


    if (!currentStoryId)
        return null;


    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2" size="sm">
                        {currentChapterNumber ? `${currentChapterNumber}: ${currentChapter?.title}` : "Chapter"}
                        <span className="text-muted-foreground">▾</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 max-h-96 overflow-y-auto">
                    {chapters.map((chapter: Chapter, index: number) => (
                        <DropdownMenuItem
                            key={chapter.id}
                            onClick={() => setCurrentChapterId(chapter.id)}
                            className={chapter.id === currentChapterId ? "bg-accent" : ""}
                        >
                            <div className="flex flex-col">
                                <span>
                                    {index + 1}: {chapter.title}
                                </span>
                                {chapter.wordCount && (
                                    <span className="text-xs text-muted-foreground">{chapter.wordCount} words</span>
                                )}
                            </div>
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Chapter
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <CreateChapterDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                characterEntries={characterEntries}
                onSubmit={handleCreateChapter}
                showTrigger={false}
            />
        </>
    );
};
