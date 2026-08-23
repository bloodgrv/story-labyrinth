import { Check, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiEntryImportDialog } from "@/features/lorebook/components/MultiEntryImportDialog";
import type { BrainstormChecklistItem, CharacterBatchPayload, HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";
import { useBrainstormChecklistActions } from "../hooks/useBrainstormChecklistActions";
import { useBrainstormChecklistQuery, useUpdateChecklistStatusMutation } from "../hooks/useBrainstormChecklistQuery";
import { SlotChecklistPanel } from "./SlotChecklistPanel";

interface BrainstormChecklistTrayProps {
    chatId: string;
    storyId: string;
    // Transfer Log (T1) — this chat's own title, for the 'opened' event's fromChatTitleSnapshot.
    fromChatTitleSnapshot: string;
}

const overviewSummary = (payload: OverviewProposalPayload): { label: string; body: string } => {
    if (payload.proposalType === "synopsis") return { label: "Synopsis", body: payload.content };
    if (payload.proposalType === "note") return { label: `Note: ${payload.title}`, body: payload.content };
    return { label: `Memory: ${payload.title}`, body: payload.body };
};

// P0.4 B4 — the durable tray: overview proposals + handoffs (both backed by brainstormChecklist,
// Open/Send/Accept do NOT clear the queue — only Mark done does) + the slot checklist (a
// genuinely different, simpler known/unknown model, see SlotChecklistPanel). "This chat only"
// scope, mirroring CodexProposalTray.tsx.
export function BrainstormChecklistTray({ chatId, storyId, fromChatTitleSnapshot }: BrainstormChecklistTrayProps) {
    const [statusTab, setStatusTab] = useState<"active" | "done">("active");
    const [openBatchItem, setOpenBatchItem] = useState<BrainstormChecklistItem | null>(null);
    const { data: items = [] } = useBrainstormChecklistQuery(chatId, statusTab);
    const updateStatus = useUpdateChecklistStatusMutation();
    const { handleAcceptOverview, handleOpenHandoff, markDone, dismiss, isBusy } = useBrainstormChecklistActions({
        chatId,
        storyId,
        fromChatTitleSnapshot
    });

    const overviewItems = items.filter(i => i.kind === "overview_proposal");
    const handoffItems = items.filter(i => i.kind === "handoff");
    const characterBatchItems = items.filter(i => i.kind === "character_batch");

    const renderChecklistCard = (item: BrainstormChecklistItem) => {
        const isOverview = item.kind === "overview_proposal";
        const isCharacterBatch = item.kind === "character_batch";
        const { label, body } = isOverview
            ? overviewSummary(item.payload as OverviewProposalPayload)
            : isCharacterBatch
              ? {
                    label: `${(item.payload as CharacterBatchPayload).drafts.length} entries found`,
                    body: (item.payload as CharacterBatchPayload).filename
                }
              : { label: `Handoff → ${(item.payload as HandoffPacket).destination}`, body: (item.payload as HandoffPacket).summary };

        return (
            <Card key={item.id} className={item.status !== "pending" ? "opacity-80" : undefined}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">
                            {label}
                        </Badge>
                        {item.status !== "pending" && (
                            <Badge variant={item.status === "done" ? "default" : "outline"} className="capitalize">
                                {item.status === "dismissed" ? "Rejected" : item.status}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{body}</p>
                    {statusTab === "active" && (
                        <div className="flex gap-2">
                            {isOverview ? (
                                <Button size="sm" onClick={() => handleAcceptOverview(item)} disabled={isBusy}>
                                    <Check className="h-4 w-4 mr-1" />
                                    Accept
                                </Button>
                            ) : isCharacterBatch ? (
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setOpenBatchItem(item);
                                        if (item.status === "pending") updateStatus.mutate({ id: item.id, status: "opened" });
                                    }}
                                    disabled={isBusy}
                                >
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Review
                                </Button>
                            ) : (
                                <Button size="sm" onClick={() => handleOpenHandoff(item)} disabled={isBusy}>
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Open
                                </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => markDone(item.id)} disabled={updateStatus.isPending}>
                                {updateStatus.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                                Mark done
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={() => dismiss(item.id)}
                                disabled={updateStatus.isPending}
                                title="Reject — no longer relevant, was never acted on"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex flex-col border-l border-t border-input">
            <Tabs value={statusTab} onValueChange={value => setStatusTab(value as "active" | "done")}>
                <div className="p-2">
                    <TabsList className="w-full">
                        <TabsTrigger value="active" className="flex-1">
                            Active
                        </TabsTrigger>
                        <TabsTrigger value="done" className="flex-1">
                            Done
                        </TabsTrigger>
                    </TabsList>
                </div>
            </Tabs>

            <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">Overview proposals</p>
                {overviewItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} proposals.</p>
                ) : (
                    overviewItems.map(renderChecklistCard)
                )}
                <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Handoffs</p>
                {handoffItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} handoffs.</p>
                ) : (
                    handoffItems.map(renderChecklistCard)
                )}
                <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Character imports</p>
                {characterBatchItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} character imports.</p>
                ) : (
                    characterBatchItems.map(renderChecklistCard)
                )}
            </div>

            <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">Setup checklist</p>
            <SlotChecklistPanel storyId={storyId} />

            <MultiEntryImportDialog
                key={openBatchItem?.id ?? "none"}
                storyId={storyId}
                open={openBatchItem !== null}
                onOpenChange={open => !open && setOpenBatchItem(null)}
                initialDrafts={openBatchItem ? (openBatchItem.payload as CharacterBatchPayload).drafts : []}
            />
        </div>
    );
}
