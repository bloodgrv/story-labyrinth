import { Check, X } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { useUpdateLorebookMutation } from "@/features/lorebook/hooks/useLorebookQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { SyncSheetResult } from "@/services/api/lorebookClient";
import type { LorebookEntry } from "@/types/story";

interface SheetSyncCrossDeskCardProps {
    entry: LorebookEntry | undefined;
    storyId?: string;
    result: SyncSheetResult | null;
    onDismiss: () => void;
}

// T5 FS5 (docs/Lore_Sheet_And_Sync_Design.md §5) — renders whichever single cross-desk lane
// `syncSheetToCodex` reported on its result (mapLayoutBrief / notesStub — timelinePinId gets a
// toast only, see SheetSyncButton.tsx, since it's already durably persisted for review in
// Timeline's own Pending tab and needs no ephemeral card here). At most one of the two lanes this
// renders is ever present at once — they're mutually exclusive by category (only `location`
// produces mapLayoutBrief, only `note` produces notesStub) — so this never needs to stack cards.
export function SheetSyncCrossDeskCard({ entry, storyId, result, onDismiss }: SheetSyncCrossDeskCardProps) {
    const updateLorebookMutation = useUpdateLorebookMutation();
    const createNoteMutation = useCreateNoteMutation();
    const { setCurrentTool, setPendingNoteId } = useStoryContext();

    if (!result) return null;

    if (result.mapLayoutBrief && entry?.id) {
        const brief = result.mapLayoutBrief;
        const preview = brief.length > 220 ? `${brief.slice(0, 220)}…` : brief;

        const handleApply = () => {
            updateLorebookMutation.mutate(
                {
                    id: entry.id,
                    data: { metadata: { ...entry.metadata, placeState: { ...entry.metadata?.placeState, layoutMd: brief } } }
                },
                {
                    onSuccess: () => {
                        toast.success("Layout brief applied — open the Map to convert it into a sketch.");
                        onDismiss();
                    }
                }
            );
        };

        return (
            <Card className="border-dashed">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Map layout brief</Badge>
                        <span className="text-sm text-muted-foreground">From this sheet's Layout Notes section</span>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preview}</p>
                    <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={handleApply} disabled={updateLorebookMutation.isPending}>
                            <Check className="h-4 w-4 mr-1" />
                            Apply to map
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                            <X className="h-4 w-4 mr-1" />
                            Dismiss
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (result.notesStub && storyId) {
        const stub = result.notesStub;
        const preview = stub.content.length > 220 ? `${stub.content.slice(0, 220)}…` : stub.content;

        const handleCreate = () => {
            createNoteMutation.mutate(
                { storyId, title: stub.title, content: stub.content, type: "other" },
                {
                    onSuccess: note => {
                        setPendingNoteId(note.id);
                        setCurrentTool("notes");
                        onDismiss();
                    }
                }
            );
        };

        return (
            <Card className="border-dashed">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Notes desk</Badge>
                        <span className="text-sm text-muted-foreground">Create a linked-in-name-only note from this sheet</span>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{preview}</p>
                    <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={handleCreate} disabled={createNoteMutation.isPending}>
                            <Check className="h-4 w-4 mr-1" />
                            Create note & open
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                            <X className="h-4 w-4 mr-1" />
                            Dismiss
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return null;
}
