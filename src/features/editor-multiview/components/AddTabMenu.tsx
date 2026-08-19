import { BookOpen, FileText, Library, ListChecks, Plus, StickyNote, Tags, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useEditorLayout } from "../context/EditorLayoutContext";

interface AddTabMenuProps {
    paneId: string;
    storyId: string;
}

// "+" menu for a pane's tab strip: open another chapter's editor, or dock one of the tool
// panels (Lorebook, Tags, Outline, POV, Notes, Beats) as a tab in this same pane. The four
// chapter-scoped tools default to whichever chapter is currently focused app-wide — the same
// chapter a fresh "Mark Beat"/"Outline" click would have opened as a drawer before MultiView.
export function AddTabMenu({ paneId, storyId }: AddTabMenuProps) {
    const { data: chapters = [] } = useChaptersByStoryQuery(storyId);
    const { addTab } = useEditorLayout();
    const { currentChapterId } = useStoryContext();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {/* B5-adjacent fix (2026-08-19): was icon-only with "Add tab" as an HTML title
                    tooltip only — an identical anonymous Plus glyph sits ~40px from
                    ChapterVersionsPanel's own "New version" trigger, easy to conflate. A visible
                    text label distinguishes the two without relying on a hover tooltip. */}
                <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" title="Add tab">
                    <Plus className="h-3.5 w-3.5" />
                    Add tab
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <FileText className="h-4 w-4" />
                        Chapter
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {chapters.map(chapter => (
                            <DropdownMenuItem
                                key={chapter.id}
                                onClick={() => addTab(paneId, { kind: "chapter", chapterId: chapter.id })}
                            >
                                {chapter.title}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onClick={() => addTab(paneId, { kind: "lorebook" })}>
                    <Library className="h-4 w-4" />
                    Lorebook
                </DropdownMenuItem>
                {currentChapterId && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => addTab(paneId, { kind: "tags", chapterId: currentChapterId })}>
                            <Tags className="h-4 w-4" />
                            Tags
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => addTab(paneId, { kind: "outline", chapterId: currentChapterId })}
                        >
                            <BookOpen className="h-4 w-4" />
                            Outline
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addTab(paneId, { kind: "pov", chapterId: currentChapterId })}>
                            <User className="h-4 w-4" />
                            POV
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => addTab(paneId, { kind: "notes", chapterId: currentChapterId })}
                        >
                            <StickyNote className="h-4 w-4" />
                            Notes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => addTab(paneId, { kind: "beats", chapterId: currentChapterId })}
                        >
                            <ListChecks className="h-4 w-4" />
                            Beats
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
