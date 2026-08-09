import { Check, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface SheetProposalCardProps {
    proposal: string;
    onAccept: () => void;
    onAcceptAndSync: () => void;
    onReject: () => void;
    isSyncing?: boolean;
}

// T5 FS4, docs/Lore_Sheet_And_Sync_Design.md §7c — sibling to PsychProposalCard.tsx/
// PlaceSheetProposalCard.tsx for the ```sheet-proposal convention. No persisted "pending" row
// backs this (same ephemeral posture as those two) — Accept replaces the anchor entry's sheetBody
// wholesale (ChatInterface.tsx's handleAcceptSheet). "Accept & Sync" is a convenience chain, not a
// bypass: it does the same sheetBody write, then immediately fires the existing Sync call — whose
// own output still lands as a separate codexPendingChanges row requiring its own Approve. Two real
// gates, one click, per the design's own "two gates, one convenience click" framing.
export function SheetProposalCard({ proposal, onAccept, onAcceptAndSync, onReject, isSyncing }: SheetProposalCardProps) {
    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Lore Sheet</Badge>
                    <span className="text-sm text-muted-foreground">Proposes updating this entry's Lore Sheet</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <pre className="text-sm whitespace-pre-wrap font-mono max-h-[280px] overflow-y-auto border rounded-md p-2 bg-muted/30">
                    {proposal}
                </pre>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={onAccept} disabled={isSyncing}>
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={onAcceptAndSync} disabled={isSyncing}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        {isSyncing ? "Syncing..." : "Accept & Sync"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onReject} disabled={isSyncing}>
                        <X className="h-4 w-4 mr-1" />
                        Reject
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
