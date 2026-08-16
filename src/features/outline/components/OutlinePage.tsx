import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { CharacterArcPanel } from "@/features/outline/components/CharacterArcPanel";
import { OutlineChatRail } from "@/features/outline/components/OutlineChatRail";
import { OutlineImportPanel } from "@/features/outline/components/OutlineImportPanel";
import { OutlineItemDialog } from "@/features/outline/components/OutlineItemDialog";
import { OutlineTree } from "@/features/outline/components/OutlineTree";
import {
    useAcceptAllPendingOutlineMutation,
    useCreateOutlineItemMutation,
    useOutlineQuery,
    useRejectAllPendingOutlineMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { groupOutlineItems } from "@/features/outline/utils/groupOutlineItems";
import { useIsDesktopViewport } from "@/lib/useIsDesktopViewport";

interface OutlinePageProps {
    storyId: string;
}

export function OutlinePage({ storyId }: OutlinePageProps) {
    const { data: items = [], isLoading } = useOutlineQuery(storyId);
    const { entries: lorebookEntries } = useLorebookContext();
    const characters = useMemo(
        () => lorebookEntries.filter(entry => entry.category === "character"),
        [lorebookEntries]
    );

    const createMutation = useCreateOutlineItemMutation(storyId);
    const acceptAllMutation = useAcceptAllPendingOutlineMutation(storyId);
    const rejectAllMutation = useRejectAllPendingOutlineMutation(storyId);
    const [addChapterOpen, setAddChapterOpen] = useState(false);
    const isDesktop = useIsDesktopViewport();

    const { chapters, pendingCount } = useMemo(() => groupOutlineItems(items), [items]);

    const handleAddChapter = (data: { title: string; summary: string | null; wordCountTarget: number | null }) => {
        createMutation.mutate({
            storyId,
            parentId: null,
            type: "chapter",
            title: data.title,
            summary: data.summary,
            wordCountTarget: data.wordCountTarget,
            order: chapters.length + 1,
            source: "manual",
            status: "confirmed",
            chapterId: null
        });
    };

    if (isLoading)
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">Loading outline...</p>
            </div>
        );

    // Own internal scrolling (ScrollArea, not page-scroll) since MainContent.tsx now gives this
    // tool a bounded h-full — needed so the resizable chat rail below has a real height to size
    // against, matching the Editor tool's existing setup.
    const pageContent = (
        <ScrollArea className="h-full">
            <div className="container mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
                <Tabs defaultValue="outline">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
                        <h1 className="text-2xl font-bold sm:text-3xl">Outline</h1>
                        <TabsList>
                            <TabsTrigger value="outline">Outline</TabsTrigger>
                            <TabsTrigger value="arcs">Character Arcs</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="outline" className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => setAddChapterOpen(true)}>
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    Add Chapter
                                </Button>
                            </div>
                            {pendingCount > 0 && (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => acceptAllMutation.mutate()}
                                        disabled={acceptAllMutation.isPending || rejectAllMutation.isPending}
                                    >
                                        Accept All Suggestions ({pendingCount})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => rejectAllMutation.mutate()}
                                        disabled={acceptAllMutation.isPending || rejectAllMutation.isPending}
                                    >
                                        Reject All Suggestions ({pendingCount})
                                    </Button>
                                </div>
                            )}
                        </div>

                        <OutlineImportPanel storyId={storyId} characters={characters} />

                        {chapters.length === 0 ? (
                            <EmptyState
                                message="No outline yet. Start by adding a chapter, or ask the Outline chat to suggest a structure."
                                actionLabel="Add First Chapter"
                                onAction={() => setAddChapterOpen(true)}
                            />
                        ) : (
                            <OutlineTree storyId={storyId} items={items} characters={characters} />
                        )}
                    </TabsContent>

                    <TabsContent value="arcs">
                        <CharacterArcPanel storyId={storyId} characters={characters} />
                    </TabsContent>
                </Tabs>

                <OutlineItemDialog
                    open={addChapterOpen}
                    onOpenChange={setAddChapterOpen}
                    itemType="chapter"
                    onSubmit={handleAddChapter}
                />
            </div>
        </ScrollArea>
    );

    if (!isDesktop) return <div className="h-full">{pageContent}</div>;

    return (
        <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="outline-chat-rail-layout">
            <ResizablePanel id="outline-main" defaultSize={72} minSize={40}>
                {pageContent}
            </ResizablePanel>
            <ResizableHandle withHandle />
            {/* Deliberately NOT wired to react-resizable-panels' own collapse API — that collapses
                this WHOLE panel (chat interface included, not just the list beside it), since
                OutlineChatRail renders both inside one ResizablePanel. The list's own collapse
                toggle (OutlineChatRail.tsx's internal state, same CSS width-toggle pattern
                NotesChatRail.tsx/BrainstormTool.tsx use) only needs to hand space back to the
                chat interface next to it, not to this panel's sibling on the far left — leaves a
                fixed-width dead gap in this panel when collapsed rather than resizing the panel,
                a deliberately smaller cosmetic tradeoff over the collapse hiding the whole chat. */}
            <ResizablePanel id="outline-chat" defaultSize={28} minSize={20}>
                <OutlineChatRail storyId={storyId} />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
