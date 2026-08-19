import { Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { BrainstormChecklistItem, OverviewProposalPayload } from "@/types/brainstorm";

interface OverviewProposalCardProps {
    item: BrainstormChecklistItem;
    onAccept: (item: BrainstormChecklistItem) => void;
    disabled?: boolean;
}

const summarize = (payload: OverviewProposalPayload): { label: string; body: string } => {
    if (payload.proposalType === "synopsis") return { label: "Synopsis", body: payload.content };
    if (payload.proposalType === "note") return { label: `Note: ${payload.title}`, body: payload.content };
    return { label: `Memory: ${payload.title}`, body: payload.body };
};

// B3 fix (2026-08-19): Brainstorm's overview-proposal fence was captured correctly server-side
// (handleOverviewProposal, ChatInterface.tsx) but rendered NOTHING inline in the chat transcript
// — the only place it was visible/actionable was the separate Approvals tray, so a user reading
// only the conversation had no way to know a proposal existed. This renders right under the
// message that produced it, reusing the same accept action the tray already performs (see
// useBrainstormChecklistActions.ts) so accepting here and accepting from the tray behave
// identically. Already resolved/opened items don't render this card at all (see ChatInterface.tsx
// render-loop guard) — no separate "already handled" state needed here.
export function OverviewProposalCard({ item, onAccept, disabled }: OverviewProposalCardProps) {
    const { label, body } = summarize(item.payload as OverviewProposalPayload);

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{label}</Badge>
                    <span className="text-sm text-muted-foreground">Proposed from this reply</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{body}</p>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => onAccept(item)} disabled={disabled}>
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                    </Button>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ExternalLink className="h-3 w-3" />
                        Also in the Approvals tray
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
