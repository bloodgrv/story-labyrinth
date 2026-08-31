import { ExternalLink, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { BrainstormChecklistItem, HandoffPacket } from "@/types/brainstorm";

interface HandoffPacketCardProps {
    items: BrainstormChecklistItem[];
    onOpen: (item: BrainstormChecklistItem) => void;
    onDismiss: (item: BrainstormChecklistItem) => void;
    disabled?: boolean;
}

// B3/B16 fix (2026-08-19): sibling to OverviewProposalCard.tsx — handoff-packet items were
// captured server-side (when the extraction pass succeeded at all, see B16) but never rendered
// inline, only in the Approvals tray's "Handoffs" section. One reply can produce several handoff
// items (one packet per destination), so this renders one row per item rather than one card.
export function HandoffPacketCard({ items, onOpen, onDismiss, disabled }: HandoffPacketCardProps) {
    if (items.length === 0) return null;

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <span className="text-sm text-muted-foreground">
                    {items.length === 1 ? "Proposes handing this off" : `Proposes ${items.length} hand-offs`}
                </span>
            </CardHeader>
            <CardContent className="space-y-3">
                {items.map(item => {
                    const payload = item.payload as HandoffPacket;
                    return (
                        <div key={item.id} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize">
                                    → {payload.destination}
                                </Badge>
                                {payload.seedName && <span className="text-sm font-medium">{payload.seedName}</span>}
                            </div>
                            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{payload.summary}</p>
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => onOpen(item)} disabled={disabled}>
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Open
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground"
                                    onClick={() => onDismiss(item)}
                                    disabled={disabled}
                                    title="Reject — no longer relevant, was never acted on"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                    );
                })}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Also in the Approvals tray</span>
            </CardContent>
        </Card>
    );
}
