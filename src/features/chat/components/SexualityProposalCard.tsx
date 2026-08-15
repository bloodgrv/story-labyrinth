import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ParsedSexualityProposal } from "../services/parseSexualityProposal";

interface SexualityProposalCardProps {
    proposal: ParsedSexualityProposal;
    onAccept: () => void;
    onReject: () => void;
}

// Sibling to PsychProposalCard.tsx, for the ```sexuality-proposal convention (Character
// template's opt-in sexuality module, docs/Sexuality_Playbook_Design.md). No persisted "pending"
// row backs this, same posture as psych proposals: lives only in local React state until
// accepted (merges into the anchor entry's metadata.sexualityProfile, ChatInterface.tsx's
// handleAcceptSexuality) or rejected (discarded).
export function SexualityProposalCard({ proposal, onAccept, onReject }: SexualityProposalCardProps) {
    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Sexuality</Badge>
                    <span className="text-sm text-muted-foreground">Proposes updating this character's sexuality profile</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {(proposal.orientation || proposal.dynamic) && (
                    <div className="flex gap-4 text-sm flex-wrap">
                        {proposal.orientation && (
                            <span>
                                <span className="font-medium">Orientation:</span> {proposal.orientation}
                            </span>
                        )}
                        {proposal.dynamic && (
                            <span>
                                <span className="font-medium">Dynamic:</span> {proposal.dynamic}
                            </span>
                        )}
                    </div>
                )}
                {proposal.kinks && (
                    <p className="text-sm">
                        <span className="font-medium">Kinks:</span> {proposal.kinks}
                    </p>
                )}
                {proposal.limits && (
                    <p className="text-sm">
                        <span className="font-medium">Limits:</span> {proposal.limits}
                    </p>
                )}
                {proposal.blurb && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{proposal.blurb}</p>}
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
