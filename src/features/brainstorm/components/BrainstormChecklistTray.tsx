import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiEntryImportDialog } from "@/features/lorebook/components/MultiEntryImportDialog";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useUpdateStoryMutation } from "@/features/stories/hooks/useStoriesQuery";
import { agentMemoriesApi, deskTransfersApi } from "@/services/api/client";
import { AGENT_MEMORY_CATEGORIES, type AgentMemoryCategory } from "@/types/agentMemory";
import type { BrainstormChecklistItem, CharacterBatchPayload, HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";
import { useBrainstormChecklistQuery, useUpdateChecklistStatusMutation } from "../hooks/useBrainstormChecklistQuery";
import { useSetSlotStatusMutation } from "../hooks/useBrainstormSlotsQuery";
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
    const updateStory = useUpdateStoryMutation();
    const createNote = useCreateNoteMutation();
    const setSlotStatus = useSetSlotStatusMutation(storyId);
    const { setPendingLorebookSeed, setPendingChatComposerSeed, setCurrentTool } = useStoryContext();

    const overviewItems = items.filter(i => i.kind === "overview_proposal");
    const handoffItems = items.filter(i => i.kind === "handoff");
    const characterBatchItems = items.filter(i => i.kind === "character_batch");
    const isBusy = updateStatus.isPending || updateStory.isPending || createNote.isPending;

    const markDone = (id: string) => updateStatus.mutate({ id, status: "done" });

    // Accept performs the actual write (synopsis/note/memory) then moves the row to "opened" —
    // NOT "done": per B4's doctrine, only the user's own explicit Mark done leaves the active
    // queue, even for an action that already completed.
    const handleAcceptOverview = (item: BrainstormChecklistItem) => {
        const payload = item.payload as OverviewProposalPayload;
        if (payload.proposalType === "synopsis") updateStory.mutate({ id: storyId, data: { synopsis: payload.content } });
        else if (payload.proposalType === "note") createNote.mutate({ storyId, title: payload.title, content: payload.content, type: payload.noteType });
        else if (payload.proposalType === "memory") {
            // The model can only pick a category name it's seen defined nowhere in its own
            // instructions (chatContextService.ts's OVERVIEW_PROPOSAL_INSTRUCTIONS never lists
            // the valid set) — fall back to 'project_note' rather than letting an invalid value
            // fail the create request outright.
            const category: AgentMemoryCategory = AGENT_MEMORY_CATEGORIES.includes(payload.category as AgentMemoryCategory)
                ? (payload.category as AgentMemoryCategory)
                : "project_note";
            void agentMemoriesApi.createNote({ storyId, category, title: payload.title, body: payload.body });
        }
        if (payload.slotKey) setSlotStatus.mutate({ slotKey: payload.slotKey, status: "known" });
        updateStatus.mutate({ id: item.id, status: "opened" });
        // Transfer Log (T1) — only "note" crosses a desk boundary; synopsis/memory write directly
        // into story fields/Project Memory, not a desk (see ChatInterface.tsx's onOverviewProposal
        // for the matching 'proposed' half of this same scoping decision).
        if (payload.proposalType === "note")
            deskTransfersApi
                .log(storyId, {
                    event: "opened",
                    kind: "overview_proposal",
                    fromDesk: "brainstorm",
                    fromChatId: chatId,
                    fromChatTitleSnapshot,
                    toDesk: "notes",
                    subject: payload.title,
                    sourceChecklistItemId: item.id
                })
                .catch(() => {});
    };

    // WB reuses the existing pendingLorebookSeed handoff mechanism unchanged (same shape a
    // lore-suggestion already produces). Notes now has its own chat rail (P0.4 K1) so "notes"
    // navigates+seeds the same as Outline/Research, matching every other destination's behavior —
    // previously (before K1) it just created the note directly with no navigation.
    const handleOpenHandoff = (item: BrainstormChecklistItem) => {
        const payload = item.payload as HandoffPacket;
        if (payload.destination === "worldbuilding") {
            setPendingLorebookSeed({ name: payload.seedName || payload.summary.slice(0, 60), category: payload.seedCategory ?? "character", blurb: payload.summary });
            setCurrentTool("lorebook");
        } else {
            setPendingChatComposerSeed({ tool: payload.destination, text: payload.detail });
            setCurrentTool(payload.destination);
        }
        updateStatus.mutate({ id: item.id, status: "opened" });
        deskTransfersApi
            .log(storyId, {
                event: "opened",
                kind: "handoff",
                fromDesk: "brainstorm",
                fromChatId: chatId,
                fromChatTitleSnapshot,
                toDesk: payload.destination,
                subject: payload.summary,
                crumb: payload.detail,
                sourceChecklistItemId: item.id
            })
            .catch(() => {});
    };

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
                                {item.status}
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
