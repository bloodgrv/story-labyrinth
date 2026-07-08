import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useApproveProposalMutation, useRejectProposalMutation } from "@/features/chat/hooks/useCodexProposalsQuery";
import type { CodexPendingChange } from "@/types/codex";

interface ProposalCardProps {
    proposal: CodexPendingChange;
    chatId: string;
    // The stub entry always exists by the time a proposal is created (see
    // chatCodexService.ts's proposeNewEntry) — name/category live on the entry, not the
    // pending change itself, so the caller resolves them (e.g. from useLorebookContext).
    entryName: string;
    entryCategory: string;
}

export function ProposalCard({ proposal, chatId, entryName, entryCategory }: ProposalCardProps) {
    const approveMutation = useApproveProposalMutation(chatId);
    const rejectMutation = useRejectProposalMutation(chatId);
    const isResolved = proposal.status !== "pending";
    const actionLabel = proposal.proposedNeedsFleshingOut === false ? "flesh out" : "update";

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                            {entryCategory}
                        </Badge>
                        <span className="text-sm text-muted-foreground">Proposes to {actionLabel} "{entryName}"</span>
                    </div>
                    {isResolved && (
                        <Badge variant={proposal.status === "approved" ? "default" : "outline"} className="capitalize">
                            {proposal.status}
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {proposal.proposedDescription && <p className="text-sm text-muted-foreground">{proposal.proposedDescription}</p>}

                {!isResolved && (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => approveMutation.mutate(proposal.id)} disabled={approveMutation.isPending}>
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectMutation.mutate(proposal.id)}
                            disabled={rejectMutation.isPending}
                        >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
