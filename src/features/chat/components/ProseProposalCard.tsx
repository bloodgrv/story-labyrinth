import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ProseProposalCardProps {
    text: string;
    // True when this proposal was generated during an active Selection Rework (a FocusTarget was
    // captured for the turn that produced it) — Accept replaces that selection instead of
    // inserting a new paragraph, so the header copy should say so.
    replacesSelection?: boolean;
    onAccept: () => void;
    onReject: () => void;
}

// Sibling to ProposalCard.tsx, for the ```prose-proposal convention (see parseProseProposal.ts)
// rather than Codex changes. No persisted "pending" row backs this — like Scene Beat's own
// stream-preview, it lives only in the chat's local React state until the user acts on it.
export function ProseProposalCard({ text, replacesSelection = false, onAccept, onReject }: ProseProposalCardProps) {
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
