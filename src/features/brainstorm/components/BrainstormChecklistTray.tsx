import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useUpdateStoryMutation } from "@/features/stories/hooks/useStoriesQuery";
import { agentMemoriesApi } from "@/services/api/client";
import { AGENT_MEMORY_CATEGORIES, type AgentMemoryCategory } from "@/types/agentMemory";
import type { BrainstormChecklistItem, HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";
import { useBrainstormChecklistQuery, useUpdateChecklistStatusMutation } from "../hooks/useBrainstormChecklistQuery";
import { useSetSlotStatusMutation } from "../hooks/useBrainstormSlotsQuery";
import { SlotChecklistPanel } from "./SlotChecklistPanel";

interface BrainstormChecklistTrayProps {
    chatId: string;
    storyId: string;
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
export function BrainstormChecklistTray({ chatId, storyId }: BrainstormChecklistTrayProps) {
    const [statusTab, setStatusTab] = useState<"active" | "done">("active");
    const { data: items = [] } = useBrainstormChecklistQuery(chatId, statusTab);
    const updateStatus = useUpdateChecklistStatusMutation();
    const updateStory = useUpdateStoryMutation();
    const createNote = useCreateNoteMutation();
    const setSlotStatus = useSetSlotStatusMutation(storyId);
    const { setPendingLorebookSeed, setPendingChatComposerSeed, setCurrentTool } = useStoryContext();

    const overviewItems = items.filter(i => i.kind === "overview_proposal");
    const handoffItems = items.filter(i => i.kind === "handoff");
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
    };

    // WB reuses the existing pendingLorebookSeed handoff mechanism unchanged (same shape a
    // lore-suggestion already produces). Notes has no chat rail of its own yet (K1 not built) so
    // "Send" just creates the note directly, no navigation. Outline/Research both prefill that
    // chat's composer via the generalized pendingChatComposerSeed (see StoryContext.tsx,
    // OutlineChatRail.tsx, ResearchTool.tsx).
    const handleOpenHandoff = (item: BrainstormChecklistItem) => {
        const payload = item.payload as HandoffPacket;
        if (payload.destination === "worldbuilding") {
            setPendingLorebookSeed({ name: payload.seedName || payload.summary.slice(0, 60), category: payload.seedCategory ?? "character", blurb: payload.summary });
            setCurrentTool("lorebook");
        } else if (payload.destination === "notes") {
            createNote.mutate({ storyId, title: payload.summary.slice(0, 60), content: payload.detail, type: "idea" });
        } else {
            setPendingChatComposerSeed({ tool: payload.destination, text: payload.detail });
            setCurrentTool(payload.destination);
        }
        updateStatus.mutate({ id: item.id, status: "opened" });
    };

    const renderChecklistCard = (item: BrainstormChecklistItem) => {
        const isOverview = item.kind === "overview_proposal";
        const { label, body } = isOverview
            ? overviewSummary(item.payload as OverviewProposalPayload)
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
                            ) : (
                                <Button size="sm" onClick={() => handleOpenHandoff(item)} disabled={isBusy}>
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    {(item.payload as HandoffPacket).destination === "notes" ? "Send" : "Open"}
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
            </div>

            <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">Setup checklist</p>
            <SlotChecklistPanel storyId={storyId} />
        </div>
    );
}
