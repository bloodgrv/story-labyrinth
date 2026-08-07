import { Check, Clock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ParsedTimelinePinProposalItem } from "@/features/chat/services/parseTimelinePinProposal";

const whenLabel = (item: ParsedTimelinePinProposalItem): string => {
    if (item.whenKind === "civil" && item.civilDate) return item.civilDate;
    if (item.whenKind === "relative" && item.relativeOffsetYears != null) {
        const years = Math.abs(item.relativeOffsetYears);
        if (item.relativeOffsetYears === 0) return "Story-start";
        return `${years}y ${item.relativeOffsetYears < 0 ? "before" : "after"} start`;
    }
    if (item.whenKind === "fuzzy" && item.fuzzyPhrase) return item.fuzzyPhrase;
    return "Unordered";
};

interface TimelinePinProposalCardProps {
    items: ParsedTimelinePinProposalItem[];
    onAccept: (item: ParsedTimelinePinProposalItem) => void;
    onReject: (item: ParsedTimelinePinProposalItem) => void;
    onAcceptAll: () => void;
    isSubmitting?: boolean;
}

// TL7, docs/Story_Timeline_Design.md — sibling to PsychProposalCard.tsx, for the
// ```timeline-pin-proposal convention (WB "timeline" template). Unlike psych (single object),
// the fence carries an ARRAY — a planning conversation naturally yields several beats at once —
// so this card renders one row per proposed pin, each with its own Accept/Reject, plus a header
// "Accept all". No persisted "pending" row backs this: purely local state in ChatInterface.tsx
// until each item is accepted (creates a real pin, defaults to Spine) or rejected (discarded).
export function TimelinePinProposalCard({ items, onAccept, onReject, onAcceptAll, isSubmitting }: TimelinePinProposalCardProps) {
    if (items.length === 0) return null;

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Timeline</Badge>
                        <span className="text-sm text-muted-foreground">
                            Proposes {items.length} new timeline pin{items.length === 1 ? "" : "s"} on Spine
                        </span>
                    </div>
                    {items.length > 1 && (
                        <Button size="sm" variant="outline" onClick={onAcceptAll} disabled={isSubmitting}>
                            Accept all
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                        <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {whenLabel(item)}
                            </div>
                            {item.blurb && <p className="text-xs text-muted-foreground line-clamp-2">{item.blurb}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => onAccept(item)} disabled={isSubmitting}>
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onReject(item)} disabled={isSubmitting}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
