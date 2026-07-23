import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { PlaceState } from "@/types/story";

interface PlaceSheetProposalCardProps {
    proposal: PlaceState;
    onAccept: () => void;
    onReject: () => void;
}

const FIELD_LABELS: Record<keyof PlaceState, string> = {
    scale: "Scale",
    biomeOrClimate: "Biome / climate",
    holder: "Holder",
    dangerLevel: "Danger level",
    landmarks: "Landmarks",
    exitsSummary: "Exits summary",
    layoutMd: "Layout",
    imageBrief: "Image brief"
};

// L1, docs/Locations_And_Maps_Design.md — sibling to PsychProposalCard.tsx, for the
// ```place-sheet-proposal convention. No persisted "pending" row backs this, same posture as
// psych/note proposals: lives only in local React state until accepted (merges into the anchor
// entry's metadata.placeState, ChatInterface.tsx's handleAcceptPlaceSheet) or rejected (discarded).
export function PlaceSheetProposalCard({ proposal, onAccept, onReject }: PlaceSheetProposalCardProps) {
    const entries = (Object.keys(FIELD_LABELS) as (keyof PlaceState)[])
        .map(key => [key, proposal[key]] as const)
        .filter(([, value]) => value !== undefined && (typeof value !== "object" || value.length > 0));

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Place sheet</Badge>
                    <span className="text-sm text-muted-foreground">Proposes updating this location's place sheet</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <dl className="space-y-1.5 text-sm">
                    {entries.map(([key, value]) => (
                        <div key={key}>
                            <dt className="font-medium inline">{FIELD_LABELS[key]}:</dt>{" "}
                            <dd className="inline whitespace-pre-wrap text-muted-foreground">
                                {Array.isArray(value) ? value.join(", ") : value}
                            </dd>
                        </div>
                    ))}
                </dl>
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
