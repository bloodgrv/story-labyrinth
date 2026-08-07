import { BookOpen, Calendar, FileEdit, StickyNote, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { TimelinePin } from "@/types/storyTimeline";
import { PinMembershipPopover } from "./PinMembershipPopover";

const linkIcon = { chapter: FileEdit, lorebook: BookOpen, note: StickyNote };

// Exported for reuse by TimelineOverviewStrip.tsx (TL9) — same resolved display label logic.
export const whenLabel = (pin: TimelinePin): string => {
    if (pin.whenKind === "civil" && pin.civilDate) return pin.civilDate;
    if (pin.whenKind === "relative" && pin.relativeOffsetYears != null) {
        const years = Math.abs(pin.relativeOffsetYears);
        if (pin.relativeOffsetYears === 0) return "Story-start";
        return `${years}y ${pin.relativeOffsetYears < 0 ? "before" : "after"} start`;
    }
    if (pin.whenKind === "fuzzy" && pin.fuzzyPhrase) return pin.fuzzyPhrase;
    return "Unordered";
};

interface PinCardProps {
    storyId: string;
    pin: TimelinePin;
    onEdit: (pin: TimelinePin) => void;
    onDelete: (pin: TimelinePin) => void;
    // Fuzzy-tier drag reorder (TimelineBoard.tsx's SortablePinCard) — rendered as a small grip
    // handle rather than wrapping the whole card in dnd-kit listeners, which would otherwise
    // swallow clicks meant for Edit/Remove/Open-link inside the card (found live during
    // verification: dnd-kit's PointerSensor intercepted every click on the card, including on its
    // own buttons, before this fix).
    dragHandle?: ReactNode;
}

// Story Timeline (T6, TL1/TL3) — pin display + click-through "open link" when linked, reusing the
// same one-shot StoryContext navigation pointers every other cross-tool jump in this app uses.
export function PinCard({ storyId, pin, onEdit, onDelete, dragHandle }: PinCardProps) {
    const { setCurrentChapterId, setCurrentTool, setPendingLorebookEntryId, setPendingNoteId } = useStoryContext();

    const handleOpenLink = () => {
        if (!pin.linkType || !pin.linkId) return;
        if (pin.linkType === "chapter") {
            setCurrentChapterId(pin.linkId);
            setCurrentTool("editor");
        } else if (pin.linkType === "lorebook") {
            setPendingLorebookEntryId(pin.linkId);
            setCurrentTool("lorebook");
        } else if (pin.linkType === "note") {
            setPendingNoteId(pin.linkId);
            setCurrentTool("notes");
        }
    };

    const LinkIcon = pin.linkType ? linkIcon[pin.linkType] : null;

    return (
        <Card className="w-56 shrink-0" data-pin-id={pin.id}>
            <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-1">
                    <div className="flex items-start gap-1 min-w-0">
                        {dragHandle ?? <span className="w-3.5 shrink-0" />}
                        <h4 className="text-sm font-semibold leading-tight">{pin.title}</h4>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                        <PinMembershipPopover storyId={storyId} pin={pin} />
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit pin" onClick={() => onEdit(pin)}>
                            <FileEdit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Remove pin" onClick={() => onDelete(pin)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {whenLabel(pin)}
                </div>
                {pin.blurb && <p className="text-xs text-muted-foreground line-clamp-2">{pin.blurb}</p>}
                {LinkIcon && (
                    <Button variant="outline" size="sm" className="h-6 text-xs w-full justify-start gap-1.5" onClick={handleOpenLink}>
                        <LinkIcon className="h-3 w-3" />
                        Open {pin.linkType}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
