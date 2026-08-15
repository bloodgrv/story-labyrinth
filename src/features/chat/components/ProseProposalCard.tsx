import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ProseProposalCardProps {
    text: string;
    // True when this proposal was generated during an active Selection Rework (a FocusTarget was
    // captured for the turn that produced it) — Accept replaces that selection instead of
    // inserting a new paragraph, so the header copy should say so.
    replacesSelection?: boolean;
    // True while Accept is awaiting Auto Humanizer's /process call (AH4) — never set for a
    // rework-target proposal, since Auto Humanizer never touches those. Disables both buttons
    // and swaps Accept's label so the "hard silent" gate reads as busy, not stalled.
    isBusy?: boolean;
    onAccept: () => void;
    onReject: () => void;
}

// Sibling to ProposalCard.tsx, for the ```prose-proposal convention (see parseProseProposal.ts)
// rather than Codex changes. No persisted "pending" row backs this — like Scene Beat's own
// stream-preview, it lives only in the chat's local React state until the user acts on it.
export function ProseProposalCard({ text, replacesSelection = false, isBusy = false, onAccept, onReject }: ProseProposalCardProps) {
    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <span className="text-sm text-muted-foreground">
                    {replacesSelection ? "Proposes to replace your selection" : "Proposes to add this to the chapter"}
                </span>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm whitespace-pre-wrap">{text}</p>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onAccept} disabled={isBusy}>
                        {isBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                        {isBusy ? "Humanizing…" : "Accept"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onReject} disabled={isBusy}>
                        <X className="h-4 w-4 mr-1" />
                        Reject
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
