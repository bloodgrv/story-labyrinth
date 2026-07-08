import { attemptPromise } from "@jfdi/attempt";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { CharacterArcPanel } from "@/features/outline/components/CharacterArcPanel";
import { OutlineItemDialog } from "@/features/outline/components/OutlineItemDialog";
import { OutlineTree } from "@/features/outline/components/OutlineTree";
import {
    useCreateOutlineItemMutation,
    useGenerateOutlineMutation,
    useOutlineQuery,
    useRejectAllPendingOutlineMutation
} from "@/features/outline/hooks/useOutlineQuery";
import { groupOutlineItems } from "@/features/outline/utils/groupOutlineItems";

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
    const generateMutation = useGenerateOutlineMutation(storyId);
    const rejectAllMutation = useRejectAllPendingOutlineMutation(storyId);
    const [addChapterOpen, setAddChapterOpen] = useState(false);

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

    // Unlike beat detection's silent background pass, this is always an explicit button click,
    // so full success/error/empty-result feedback is appropriate here.
    const handleGenerate = async () => {
        const [error, result] = await attemptPromise(() => generateMutation.mutateAsync());
        if (error) {
            toast.error("Failed to generate outline suggestions");
            return;
        }
        if (!result.success) {
            toast.error(result.message ?? "Failed to generate outline suggestions");
            return;
        }
        const count = result.suggestions?.filter(item => item.type === "chapter").length ?? 0;
        toast.success(
            count > 0
                ? `${count} chapter suggestion${count === 1 ? "" : "s"} ready to review`
                : "No new suggestions generated"
        );
    };

    if (isLoading)
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground">Loading outline...</p>
            </div>
        );

    return (
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
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleGenerate}
                                disabled={generateMutation.isPending}
                            >
                                {generateMutation.isPending ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Generate with AI
                            </Button>
                        </div>
                        {pendingCount > 0 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => rejectAllMutation.mutate()}
                                disabled={rejectAllMutation.isPending}
                            >
                                Reject All Suggestions ({pendingCount})
                            </Button>
                        )}
                    </div>

                    <ScrollArea className="h-[calc(100vh-16rem)]">
                        {chapters.length === 0 ? (
                            <EmptyState
                                message="No outline yet. Start by adding a chapter, or let AI suggest a structure for you."
                                actionLabel="Add First Chapter"
                                onAction={() => setAddChapterOpen(true)}
                            />
                        ) : (
                            <OutlineTree storyId={storyId} items={items} characters={characters} />
                        )}
                    </ScrollArea>
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
    );
}
