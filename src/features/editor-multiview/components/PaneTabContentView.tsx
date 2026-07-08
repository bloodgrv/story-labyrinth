import { Loader2 } from "lucide-react";
import EmbeddedPlayground from "@/components/story-editor/EmbeddedPlayground";
import { ChapterNotesEditor } from "@/features/chapters/components/ChapterNotesEditor";
import { ChapterOutline } from "@/features/chapters/components/ChapterOutline";
import { ChapterPOVEditor } from "@/features/chapters/components/ChapterPOVEditor";
import { ConcreteBeatsPanel } from "@/features/chapters/components/ConcreteBeatsPanel";
import { MatchedTagEntries } from "@/features/chapters/components/MatchedTagEntries";
import { useChapterQuery } from "@/features/chapters/hooks/useChaptersQuery";
import LorebookPage from "@/features/lorebook/pages/LorebookPage";
import { EditorPaneProvider } from "../context/EditorPaneContext";
import type { PaneTabContent } from "../types";

const NOOP = () => {};

interface PaneTabContentViewProps {
    content: PaneTabContent;
    storyId: string;
}

// The one place that maps a tab's content kind to the component it renders — shared by docked
// pane tabs (EditorPane) and floating panels (FloatingPanel), so "what a Lorebook/Outline/Tags/
// etc. tab looks like" only has to be decided once regardless of where it's displayed.
export function PaneTabContentView({ content, storyId }: PaneTabContentViewProps) {
    if (content.kind === "chapter")
        return (
            <EditorPaneProvider chapterId={content.chapterId} storyId={storyId}>
                <EmbeddedPlayground />
            </EditorPaneProvider>
        );

    if (content.kind === "lorebook") return <LorebookPage storyId={storyId} />;

    if (content.kind === "tags") return <MatchedTagEntries chapterId={content.chapterId} />;

    return <ChapterScopedContent content={content} />;
}

function ChapterScopedContent({
    content
}: {
    content: Extract<PaneTabContent, { kind: "outline" | "pov" | "notes" | "beats" }>;
}) {
    const { data: chapter, isLoading } = useChapterQuery(content.chapterId);

    if (isLoading)
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );

    // A layout can outlive the chapter it points at — restored from a previous session (see
    // layoutStorage.ts) after that chapter was deleted. Distinct from the loading state above so
    // this doesn't spin forever.
    if (!chapter)
        return (
            <div className="flex h-full items-center justify-center p-4 text-center">
                <p className="text-sm text-muted-foreground">This chapter no longer exists.</p>
            </div>
        );

    if (content.kind === "outline") return <ChapterOutline chapter={chapter} />;
    if (content.kind === "pov") return <ChapterPOVEditor chapter={chapter} onClose={NOOP} />;
    if (content.kind === "notes") return <ChapterNotesEditor chapter={chapter} onClose={NOOP} />;
    return <ConcreteBeatsPanel chapterId={content.chapterId} storyId={chapter.storyId} />;
}
