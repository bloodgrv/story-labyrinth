import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    useApproveProposalMutation,
    useRejectProposalMutation,
    useReviseProposalMutation
} from "@/features/chat/hooks/useCodexProposalsQuery";
import type { CodexPendingChange } from "@/types/codex";

interface ProposalTrayCardProps {
    proposal: CodexPendingChange;
    chatId: string;
    entryName: string;
    entryCategory: string;
}

// Per-item card for CodexProposalTray.tsx — same Approve/Reject as the inline ProposalCard.tsx
// this tray replaces for Editor chats, plus a new Edit action wiring the already-implemented,
// previously-unused useReviseProposalMutation (server-side reviseChatProposal has existed since
// before this tray — only the UI to reach it was missing). Action-row/status-badge pattern
// modeled on src/features/rag-scanner/components/IssueCard.tsx.
export function ProposalTrayCard({ proposal, chatId, entryName, entryCategory }: ProposalTrayCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftDescription, setDraftDescription] = useState(proposal.proposedDescription ?? "");
    const [draftTags, setDraftTags] = useState((proposal.proposedTags ?? []).join(", "));

    const approveMutation = useApproveProposalMutation(chatId);
    const rejectMutation = useRejectProposalMutation(chatId);
    const reviseMutation = useReviseProposalMutation(chatId);

    const isPending = proposal.status === "pending";
    const isUpdating = approveMutation.isPending || rejectMutation.isPending || reviseMutation.isPending;

    const handleSaveEdit = () => {
        reviseMutation.mutate(
            {
                pendingChangeId: proposal.id,
                data: {
                    proposedDescription: draftDescription,
                    proposedTags: draftTags
                        .split(",")
                        .map(tag => tag.trim())
                        .filter(Boolean)
                }
            },
            { onSuccess: () => setIsEditing(false) }
        );
    };

    return (
        <Card className={proposal.status !== "pending" && proposal.status !== "approved" ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">
                            {entryCategory}
                        </Badge>
                        {!isPending && (
                            <Badge variant={proposal.status === "approved" ? "default" : "outline"} className="capitalize">
                                {proposal.status}
                            </Badge>
                        )}
                    </div>
                </div>
                <span className="text-sm text-muted-foreground">
                    Proposes to {proposal.proposedNeedsFleshingOut ? "flesh out" : "update"} {entryName}
                </span>
            </CardHeader>
            <CardContent className="space-y-3">
                {isEditing ? (
                    <div className="space-y-2">
                        <Textarea
                            value={draftDescription}
                            onChange={e => setDraftDescription(e.target.value)}
                            rows={4}
                            className="text-sm"
                        />
                        <Input
                            value={draftTags}
                            onChange={e => setDraftTags(e.target.value)}
                            placeholder="tags, comma, separated"
                            className="text-sm"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveEdit} disabled={reviseMutation.isPending}>
                                {reviseMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm whitespace-pre-wrap">{proposal.proposedDescription}</p>
                )}

                {isPending && !isEditing && (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => approveMutation.mutate(proposal.id)} disabled={isUpdating}>
                            {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4 mr-1" />
                            )}
                            Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} disabled={isUpdating}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate(proposal.id)} disabled={isUpdating}>
                            {rejectMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <X className="h-4 w-4 mr-1" />
                            )}
                            Reject
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
