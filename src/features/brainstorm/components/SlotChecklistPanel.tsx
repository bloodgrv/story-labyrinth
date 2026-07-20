import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrainstormSlotsQuery, useSetSlotStatusMutation } from "../hooks/useBrainstormSlotsQuery";

interface SlotChecklistPanelProps {
    storyId: string;
}

// P0.4 B2/B4 — the fixed 5-slot known/unknown project-setup checklist, the tray's third section.
// Flipped either by manually toggling here, or automatically when a slotKey-tagged
// overview-proposal is accepted (see BrainstormChecklistTray.tsx's handleAcceptOverviewProposal).
export function SlotChecklistPanel({ storyId }: SlotChecklistPanelProps) {
    const { data: slots = [] } = useBrainstormSlotsQuery(storyId);
    const setStatus = useSetSlotStatusMutation(storyId);

    return (
        <div className="space-y-1 p-2">
            {slots.map(slot => (
                <div key={slot.slotKey} className="flex items-center justify-between gap-2 text-sm px-1 py-1">
                    <span className="truncate">{slot.label}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => setStatus.mutate({ slotKey: slot.slotKey, status: slot.status === "known" ? "unknown" : "known" })}
                    >
                        <Badge variant={slot.status === "known" ? "default" : "outline"}>{slot.status}</Badge>
                    </Button>
                </div>
            ))}
        </div>
    );
}
