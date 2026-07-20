import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getNoteTypeLabel } from "@/features/notes/components/NoteFormDialog";
import type { ParsedNoteProposal } from "../services/parseNoteProposals";

interface NoteProposalCardProps {
    proposal: ParsedNoteProposal;
    onAccept: () => void;
    onReject: () => void;
}

// N6 (Notes_Outline_Chat_Bridges_Design.md §4) — sibling to ProseProposalCard.tsx, for the
// ```note-proposal convention (see parseNoteProposals.ts). No persisted "pending" row backs
// this, same posture as prose proposals: it lives only in local React state until accepted
// (creates a Note, includeInAi defaults false — armed separately, same as any manually created
// note) or rejected (discarded).
export function NoteProposalCard({ proposal, onAccept, onReject }: NoteProposalCardProps) {
    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{getNoteTypeLabel(proposal.type)}</Badge>
                    <span className="text-sm text-muted-foreground">Proposes saving this as a Story Note</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm font-medium">{proposal.title}</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{proposal.content}</p>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onAccept}>
                        <Check className="h-4 w-4 mr-1" />
                        Save note
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
