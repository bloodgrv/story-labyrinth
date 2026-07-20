import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
    ParsedOutlineDeleteProposal,
    ParsedOutlineEditProposal,
    ParsedOutlineReorderProposal
} from "../services/parseOutlineProposals";

type NonCreateOutlineProposal = ParsedOutlineEditProposal | ParsedOutlineReorderProposal | ParsedOutlineDeleteProposal;

interface OutlineProposalCardProps {
    proposal: NonCreateOutlineProposal;
    // Best-effort title lookup for display only — falls back to a truncated id if the item can't
    // be resolved (e.g. the outline list hasn't loaded yet). Never used for the actual apply,
    // which always goes by id (see ChatInterface.tsx's handleAcceptOutlineProposal).
    resolveItemTitle: (itemId: string) => string | undefined;
    onAccept: () => void;
    onReject: () => void;
}

const shortId = (id: string) => `${id.slice(0, 8)}…`;

// P0.4 R5 — sibling to ProseProposalCard.tsx/NoteProposalCard.tsx, for the ```outline-proposal
// convention's edit/reorder/delete cases (see parseOutlineProposals.ts). "create" never reaches
// this card — it's persisted immediately as a pending outlineItems row and reviewed via the
// existing tree Accept/Reject badges instead (OutlineChapterCard.tsx/OutlineSceneRow.tsx). No
// persisted "pending" row backs this card either, same ephemeral posture as prose/note proposals:
// Accept calls the existing outline mutation (PUT/PATCH/DELETE) directly.
export function OutlineProposalCard({ proposal, resolveItemTitle, onAccept, onReject }: OutlineProposalCardProps) {
    const renderBody = () => {
        switch (proposal.type) {
            case "edit": {
                const label = resolveItemTitle(proposal.itemId) ?? shortId(proposal.itemId);
                return (
                    <div className="space-y-1 text-sm">
                        <p className="text-muted-foreground">
                            Editing <span className="font-medium text-foreground">{label}</span>
                        </p>
                        {proposal.title !== undefined && (
                            <p>
                                <span className="text-muted-foreground">Title →</span> {proposal.title}
                            </p>
                        )}
                        {proposal.summary !== undefined && (
                            <p className="whitespace-pre-wrap">
                                <span className="text-muted-foreground">Summary →</span> {proposal.summary}
                            </p>
                        )}
                        {proposal.wordCountTarget !== undefined && (
                            <p>
                                <span className="text-muted-foreground">Word count target →</span> {proposal.wordCountTarget ?? "none"}
                            </p>
                        )}
                    </div>
                );
            }
            case "reorder":
                return (
                    <ul className="space-y-1 text-sm">
                        {proposal.updates.map(update => (
                            <li key={update.id} className="text-muted-foreground">
                                <span className="font-medium text-foreground">{resolveItemTitle(update.id) ?? shortId(update.id)}</span>
                                {" → position "}
                                {update.order}
                                {update.parentId ? ` under ${resolveItemTitle(update.parentId) ?? shortId(update.parentId)}` : ""}
                            </li>
                        ))}
                    </ul>
                );
            case "delete":
                return (
                    <p className="text-sm">
                        Delete <span className="font-medium">{resolveItemTitle(proposal.itemId) ?? shortId(proposal.itemId)}</span>
                        {proposal.itemId && " and any child scenes"}?
                    </p>
                );
        }
    };

    const badgeLabel = proposal.type === "edit" ? "Edit" : proposal.type === "reorder" ? "Reorder" : "Delete";

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{badgeLabel}</Badge>
                    <span className="text-sm text-muted-foreground">Proposes an outline change</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {renderBody()}
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
