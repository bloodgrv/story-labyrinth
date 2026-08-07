import { Calendar, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApprovePinMutation, usePendingPinsQuery, useRejectPinMutation } from "../hooks/useStoryTimelineQuery";
import { whenLabel } from "./PinCard";

interface PendingPinsPanelProps {
    storyId: string;
}

// TL11B, docs/Story_Timeline_Design.md — mirrors PendingEdgesPanel.tsx (Lorebook Relationship
// Graph's own pending-review tab) exactly. Only timeline_suggest_pins writes "pending" rows.
export function PendingPinsPanel({ storyId }: PendingPinsPanelProps) {
    const pendingQuery = usePendingPinsQuery(storyId);
    const approveMutation = useApprovePinMutation(storyId);
    const rejectMutation = useRejectPinMutation(storyId);

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
            {pending.map(pin => {
                const isBusy =
                    (approveMutation.isPending && approveMutation.variables === pin.id) ||
                    (rejectMutation.isPending && rejectMutation.variables === pin.id);
                return (
                    <div key={pin.id} className="rounded border p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-sm min-w-0">
                            <span className="truncate font-medium">{pin.title}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {whenLabel(pin)}
                        </div>
                        {pin.blurb && <p className="text-xs text-muted-foreground">{pin.blurb}</p>}
                        <div className="flex items-center gap-2">
                            <Button size="sm" disabled={isBusy} onClick={() => approveMutation.mutate(pin.id)}>
                                <Check className="h-3.5 w-3.5 mr-1.5" />
                                Approve
                            </Button>
                            <Button size="sm" variant="outline" disabled={isBusy} onClick={() => rejectMutation.mutate(pin.id)}>
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
