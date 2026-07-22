import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrainstormChecklistQuery, useUpdateChecklistStatusMutation } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useUpdateStoryMutation } from "@/features/stories/hooks/useStoriesQuery";
import { deskTransfersApi } from "@/services/api/client";
import type { BrainstormChecklistItem, HandoffPacket, NoteSplitProposalPayload, OverviewProposalPayload } from "@/types/brainstorm";
import { useCreateNoteMutation } from "../hooks/useNotesQuery";

interface NotesChecklistTrayProps {
    chatId: string;
    storyId: string;
    // Transfer Log (T1) — this chat's own title, for the 'opened' event's fromChatTitleSnapshot.
    fromChatTitleSnapshot: string;
}

// P0.4 K3 — Notes' own durable tray, forked from BrainstormChecklistTray.tsx (not generalizing
// that shared component in place — smaller blast radius, Brainstorm's stays untouched) but
// reusing its already chatType-agnostic hooks/table unchanged (useBrainstormChecklistQuery,
// useUpdateChecklistStatusMutation — confirmed via exploration: zero chatType enforcement
// anywhere in the checklist write path). Three sections instead of Brainstorm's two: note_split
// (K2/K4's "Accept all" for a pasted-dump split), overview_proposal (synopsis-only here — Notes'
// own NOTES_PROMOTE_INSTRUCTIONS never offers the "note"/"memory" sub-types), handoff
// (worldbuilding/outline only — promoting a note to itself or to Research isn't offered). Same
// "Open/Accept doesn't clear, only Mark done does" doctrine as Brainstorm's tray throughout.
export function NotesChecklistTray({ chatId, storyId, fromChatTitleSnapshot }: NotesChecklistTrayProps) {
    const [statusTab, setStatusTab] = useState<"active" | "done">("active");
    const { data: items = [] } = useBrainstormChecklistQuery(chatId, statusTab);
    const updateStatus = useUpdateChecklistStatusMutation();
    const updateStory = useUpdateStoryMutation();
    const createNote = useCreateNoteMutation();
    const { setPendingLorebookSeed, setPendingChatComposerSeed, setCurrentTool } = useStoryContext();

    const splitItems = items.filter(i => i.kind === "note_split");
    const overviewItems = items.filter(i => i.kind === "overview_proposal");
    const handoffItems = items.filter(i => i.kind === "handoff");
    const isBusy = updateStatus.isPending || updateStory.isPending || createNote.isPending;

    const markDone = (id: string) => updateStatus.mutate({ id, status: "done" });

    // Same "perform the write, then move to opened (never done)" doctrine as Brainstorm's tray —
    // only the user's own explicit Mark done leaves the Active queue.
    const handleAcceptSplit = (item: BrainstormChecklistItem) => {
        const payload = item.payload as NoteSplitProposalPayload;
        for (const note of payload.notes) createNote.mutate({ storyId, title: note.title, content: note.content, type: note.type });
        updateStatus.mutate({ id: item.id, status: "opened" });
    };

    const handleAcceptOverview = (item: BrainstormChecklistItem) => {
        const payload = item.payload as OverviewProposalPayload;
        // Notes' own instructions only ever offer "synopsis" — the other two sub-types are
        // structurally still accepted by the shared parser, so degrade gracefully rather than
        // silently dropping a proposal if the model emits one anyway.
        if (payload.proposalType === "synopsis") updateStory.mutate({ id: storyId, data: { synopsis: payload.content } });
        else if (payload.proposalType === "note") createNote.mutate({ storyId, title: payload.title, content: payload.content, type: payload.noteType });
        updateStatus.mutate({ id: item.id, status: "opened" });
    };

    // Same setPendingLorebookSeed / setPendingChatComposerSeed + navigate pattern as Brainstorm's
    // handleOpenHandoff — reused verbatim, just restricted (by NOTES_PROMOTE_INSTRUCTIONS, not
    // enforced here) to worldbuilding/outline destinations.
    const handleOpenHandoff = (item: BrainstormChecklistItem) => {
        const payload = item.payload as HandoffPacket;
        if (payload.destination === "worldbuilding") {
            setPendingLorebookSeed({
                name: payload.seedName || payload.summary.slice(0, 60),
                category: payload.seedCategory ?? "character",
                blurb: payload.summary
            });
            setCurrentTool("lorebook");
        } else {
            setPendingChatComposerSeed({ tool: payload.destination, text: payload.detail });
            setCurrentTool(payload.destination);
        }
        updateStatus.mutate({ id: item.id, status: "opened" });
        // Transfer Log (T1) — Notes -> WB/Outline crosses a desk boundary (unlike this tray's
        // overview_proposal "synopsis"/"note" sub-types, which stay within Notes/story-fields —
        // see handleAcceptOverview above, deliberately not instrumented for that reason).
        deskTransfersApi
            .log(storyId, {
                event: "opened",
                kind: "handoff",
                fromDesk: "notes",
                fromChatId: chatId,
                fromChatTitleSnapshot,
                toDesk: payload.destination,
                subject: payload.summary,
                crumb: payload.detail,
                sourceChecklistItemId: item.id
            })
            .catch(() => {});
    };

    const renderSplitCard = (item: BrainstormChecklistItem) => {
        const payload = item.payload as NoteSplitProposalPayload;
        return (
            <Card key={item.id} className={item.status !== "pending" ? "opacity-80" : undefined}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline">Split — {payload.notes.length} notes</Badge>
                        {item.status !== "pending" && (
                            <Badge variant={item.status === "done" ? "default" : "outline"} className="capitalize">
                                {item.status}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <ul className="text-sm list-disc list-inside space-y-0.5">
                        {payload.notes.map((n, i) => (
                            <li key={i} className="truncate">
                                {n.title}
                            </li>
                        ))}
                    </ul>
                    {statusTab === "active" && (
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAcceptSplit(item)} disabled={isBusy}>
                                <Check className="h-4 w-4 mr-1" />
                                Accept all
                            </Button>
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

    const renderPromoteCard = (item: BrainstormChecklistItem) => {
        const isOverview = item.kind === "overview_proposal";
        const label = isOverview ? "Promote → Synopsis" : `Promote → ${(item.payload as HandoffPacket).destination}`;
        const body = isOverview
            ? ((item.payload as OverviewProposalPayload) as { content?: string; body?: string }).content ??
              ((item.payload as OverviewProposalPayload) as { body?: string }).body ??
              ""
            : (item.payload as HandoffPacket).summary;

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
                <p className="px-1 text-xs font-medium text-muted-foreground">Splits</p>
                {splitItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} splits.</p>
                ) : (
                    splitItems.map(renderSplitCard)
                )}
                <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Promote</p>
                {overviewItems.length === 0 && handoffItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} promotions.</p>
                ) : (
                    <>
                        {overviewItems.map(renderPromoteCard)}
                        {handoffItems.map(renderPromoteCard)}
                    </>
                )}
            </div>
        </div>
    );
}
