import { Check, Map as MapIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { MapSketchProposal } from "@/types/storyMaps";

interface MapSketchProposalCardProps {
    proposal: MapSketchProposal;
    onAccept: () => void;
    onReject: () => void;
}

// MV5 (docs/Maps_V2_Sketch_Design.md) — sibling to PsychProposalCard.tsx/PlaceSheetProposalCard.tsx
// for the ```map-sketch-proposal convention (Locations template, unconditional per
// chatContextService.ts's MAP_SKETCH_INSTRUCTIONS). No persisted "pending" row backs this, same
// ephemeral-until-accepted-or-rejected posture as every other proposal card here. Accept doesn't
// apply the scene itself (that needs Excalidraw's `convertToExcalidrawElements`, kept inside
// MapCanvas.tsx's lazy chunk) — it resolves/creates the anchor location's map and hands the raw
// element skeleton off via a one-shot StoryContext pointer, then navigates to the Maps tool.
export function MapSketchProposalCard({ proposal, onAccept, onReject }: MapSketchProposalCardProps) {
    const preview = proposal.elements
        .slice(0, 5)
        .map(el => el.label || el.text || el.type)
        .join(", ");
    const remaining = proposal.elements.length - 5;

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                        <MapIcon className="h-3 w-3" />
                        Sketch map
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                        {proposal.title || "Proposes a sketch"} — {proposal.elements.length} element
                        {proposal.elements.length === 1 ? "" : "s"}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    {preview}
                    {remaining > 0 ? `, +${remaining} more` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                    Accepting replaces the linked map's current sketch with this one — nudge the boxes afterward on the canvas.
                </p>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onAccept}>
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onReject}>
                        <X className="h-4 w-4 mr-1" />
                        Reject
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
