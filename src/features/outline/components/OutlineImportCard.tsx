import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveOutlineImportBatchQuery } from "@/features/outline/hooks/useOutlineImportQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";

interface OutlineImportCardProps {
    storyId: string;
}

// OI6 — the Outline chat's compact half of the import flow (design lock #5: "Outline chat shows
// compact Review in Outline / Accept / Discard card"). Dense edit/reorder/Accept/Discard all live
// in OutlineImportPanel.tsx (the Outline tool panel) — this card is just a pointer at it, plus a
// count so the user knows there's something waiting without leaving the chat.
export function OutlineImportCard({ storyId }: OutlineImportCardProps) {
    const { data } = useActiveOutlineImportBatchQuery(storyId);
    const { setCurrentTool } = useStoryContext();

    if (!data?.batch) return null;
    const { batch, checklist } = data;
    const richCount = checklist.filter(item => item.status === "pending" || item.status === "opened").length;

    return (
        <Card className="m-2">
            <CardContent className="flex items-center justify-between gap-2 p-3">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                        <p className="truncate text-xs font-medium">Structure ready · {batch.structureDraft.length} chapters</p>
                        {richCount > 0 && <p className="text-xs text-muted-foreground">{richCount} rich item(s) in tray</p>}
                    </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setCurrentTool("outline")}>
                    Review in Outline
                </Button>
            </CardContent>
        </Card>
    );
}
