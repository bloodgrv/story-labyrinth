import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STORY_GRAPH_EDGE_TYPE_LABELS } from "@/types/storyGraph";
import { useApproveEdgeMutation, usePendingEdgesQuery, useRejectEdgeMutation } from "../hooks/useStoryGraphQuery";

interface PendingEdgesPanelProps {
    storyId: string;
}

export function PendingEdgesPanel({ storyId }: PendingEdgesPanelProps) {
    const pendingQuery = usePendingEdgesQuery(storyId);
    const approveMutation = useApproveEdgeMutation();
    const rejectMutation = useRejectEdgeMutation();

    if (pendingQuery.isLoading)
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );

    const pending = pendingQuery.data?.pending ?? [];

    if (pending.length === 0)
        return (
            <div className="flex items-center justify-center h-full p-6">
                <p className="text-muted-foreground text-sm">No pending suggestions.</p>
            </div>
        );

    return (
        <div className="h-full overflow-y-auto p-3 space-y-2">
            {pending.map(({ edge, fromName, toName }) => {
                const isBusy =
                    (approveMutation.isPending && approveMutation.variables === edge.id) ||
                    (rejectMutation.isPending && rejectMutation.variables === edge.id);
                return (
                    <div key={edge.id} className="rounded border p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-sm min-w-0">
                            <span className="truncate font-medium">{fromName}</span>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {edge.label || STORY_GRAPH_EDGE_TYPE_LABELS[edge.edgeType]}
                            </Badge>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{toName}</span>
                        </div>
                        {edge.description && <p className="text-xs text-muted-foreground">{edge.description}</p>}
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                disabled={isBusy}
                                onClick={() => approveMutation.mutate(edge.id)}
                            >
                                <Check className="h-3.5 w-3.5 mr-1.5" />
                                Approve
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => rejectMutation.mutate(edge.id)}
                            >
                                <X className="h-3.5 w-3.5 mr-1.5" />
                                Reject
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
