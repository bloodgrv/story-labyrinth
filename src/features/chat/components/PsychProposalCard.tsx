import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ParsedPsychProposal } from "../services/parsePsychProposal";

interface PsychProposalCardProps {
    proposal: ParsedPsychProposal;
    onAccept: () => void;
    onReject: () => void;
}

// P0.4 B5 — sibling to NoteProposalCard.tsx, for the ```psych-proposal convention (Character
// template's opt-in psych module). No persisted "pending" row backs this, same posture as note
// proposals: lives only in local React state until accepted (merges into the anchor entry's
// metadata.psychProfile, ChatInterface.tsx's handleAcceptPsych) or rejected (discarded).
export function PsychProposalCard({ proposal, onAccept, onReject }: PsychProposalCardProps) {
    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Psychology</Badge>
                    <span className="text-sm text-muted-foreground">Proposes updating this character's psych profile</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {(proposal.mbti || proposal.enneagram) && (
                    <div className="flex gap-4 text-sm">
                        {proposal.mbti && (
                            <span>
                                <span className="font-medium">MBTI:</span> {proposal.mbti}
                            </span>
                        )}
                        {proposal.enneagram && (
                            <span>
                                <span className="font-medium">Enneagram:</span> {proposal.enneagram}
                            </span>
                        )}
                    </div>
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
