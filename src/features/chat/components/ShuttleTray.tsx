import { ExternalLink, Loader2, MessageSquareReply } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrainstormChecklistQuery, useUpdateChecklistStatusMutation } from "@/features/brainstorm/hooks/useBrainstormChecklistQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { deskTransfersApi } from "@/services/api/client";
import type { BrainstormChecklistItem, ShuttlePayload, ShuttleReturnPayload } from "@/types/brainstorm";

interface ShuttleTrayProps {
    chatId: string;
    storyId: string;
    // Transfer Log (T1) — this chat's own chatType/title, for the 'opened' event's fromDesk/
    // fromChatTitleSnapshot. Passed down rather than fetched here since every caller already has
    // the full selectedChat object in scope.
    fromDesk: string;
    fromChatTitleSnapshot: string;
    // "Answer here" (decision #8) fills THIS host chat's own composer — a sibling concern to
    // ChatInterface's initialComposerText prop, so the rail passing this down is expected to wire
    // it to the same local composerSeedText state it already threads there (see EditorChatRail.tsx/
    // OutlineChatRail.tsx/LorebookEntryEditor.tsx's WorldBuildingChatPanel).
    onAnswerHere: (text: string) => void;
}

// Chat Shuttle's origin tray (H3/H4, docs/Chat_Shuttle_Design.md), reusing the same
// brainstormChecklist table/query/mutation via two new kinds ("shuttle"/"shuttle_return", H0).
// Mounted by each outbound host's own rail (Editor/Outline/WB) alongside CodexProposalTray, same
// "this chat only" scope. Open auto-clears Active on click (2026-08-30, mirrors
// BrainstormChecklistTray/NotesChecklistTray's same change) — Answer-here still deliberately does
// NOT change status, since it's a same-chat detour, not a resolution ("Dismiss ≠ destroying the
// shuttle").
export function ShuttleTray({ chatId, storyId, fromDesk, fromChatTitleSnapshot, onAnswerHere }: ShuttleTrayProps) {
    const [statusTab, setStatusTab] = useState<"active" | "done">("active");
    const { data: items = [] } = useBrainstormChecklistQuery(chatId, statusTab);
    const updateStatus = useUpdateChecklistStatusMutation();
    const { setPendingShuttleSeed, setCurrentTool } = useStoryContext();

    const shuttleItems = items.filter(i => i.kind === "shuttle");
    const returnItems = items.filter(i => i.kind === "shuttle_return");

    const markDone = (id: string) => updateStatus.mutate({ id, status: "done" });

    // Open (decision #1/#2): hands the question+crumb to Research via the dedicated
    // pendingShuttleSeed field (H2) rather than the generic pendingChatComposerSeed — Research
    // needs the origin chat id too, to route a later "Send brief to origin" (H5). Status -> "done"
    // (2026-08-30: was "opened"/stays-Active — auto-clears now, mirroring BrainstormChecklistTray's
    // same change; explicit user request). Open stays live on the Done-tab card too, so a shuttle
    // can be re-opened into Research again later.
    const handleOpen = (item: BrainstormChecklistItem) => {
        const payload = item.payload as ShuttlePayload;
        const text = payload.crumb ? `${payload.question}\n\n(Scene context: ${payload.crumb})` : payload.question;
        setPendingShuttleSeed({ originChatId: chatId, shuttleItemId: item.id, text });
        setCurrentTool("research");
        updateStatus.mutate({ id: item.id, status: "done" });
        deskTransfersApi
            .log(storyId, {
                event: "opened",
                kind: "shuttle",
                fromDesk,
                fromChatId: chatId,
                fromChatTitleSnapshot,
                toDesk: "research",
                subject: payload.question,
                crumb: payload.crumb ?? null,
                sourceChecklistItemId: item.id
            })
            .catch(() => {});
    };

    // "Answer here" (decision #8) — seeds THIS chat's own composer with a short direct-answer
    // instruction; deliberately does NOT change the item's status, so it stays Active and
    // Openable later for a proper Research pass ("Dismiss ≠ destroying the shuttle").
    const handleAnswerHere = (item: BrainstormChecklistItem) => {
        const payload = item.payload as ShuttlePayload;
        onAnswerHere(`Please just answer this directly here (skip the Research shuttle): ${payload.question}`);
    };

    const renderShuttleCard = (item: BrainstormChecklistItem) => {
        const payload = item.payload as ShuttlePayload;
        return (
            <Card key={item.id} className={item.status !== "pending" ? "opacity-80" : undefined}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline">Shuttle → Research</Badge>
                        {item.status !== "pending" && (
                            <Badge variant={item.status === "done" ? "default" : "outline"} className="capitalize">
                                {item.status}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{payload.question}</p>
                    {payload.crumb && <p className="text-xs text-muted-foreground italic">{payload.crumb}</p>}
                    {item.status !== "dismissed" && (
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => handleOpen(item)} disabled={updateStatus.isPending}>
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Open
                            </Button>
                            {item.status === "pending" && (
                                <>
                                    <Button size="sm" variant="outline" onClick={() => handleAnswerHere(item)}>
                                        <MessageSquareReply className="h-4 w-4 mr-1" />
                                        Answer here
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => markDone(item.id)} disabled={updateStatus.isPending}>
                                        {updateStatus.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                                        Mark done
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    const renderReturnCard = (item: BrainstormChecklistItem) => {
        const payload = item.payload as ShuttleReturnPayload;
        return (
            <Card key={item.id} className={item.status !== "pending" ? "opacity-80" : undefined}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline">Brief from Research</Badge>
                        {item.status !== "pending" && (
                            <Badge variant={item.status === "done" ? "default" : "outline"} className="capitalize">
                                {item.status}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm whitespace-pre-wrap">{payload.summary}</p>
                    {payload.links.length > 0 && (
                        <ul className="space-y-1">
                            {payload.links.map(link => (
                                <li key={link.url}>
                                    <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs text-primary underline underline-offset-2"
                                    >
                                        {link.title}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                    {statusTab === "active" && (
                        <Button size="sm" variant="ghost" onClick={() => markDone(item.id)} disabled={updateStatus.isPending}>
                            {updateStatus.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                            Mark done
                        </Button>
                    )}
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col border-l border-t border-input">
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

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">Shuttles</p>
                {shuttleItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} shuttles.</p>
                ) : (
                    shuttleItems.map(renderShuttleCard)
                )}
                <p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Returned briefs</p>
                {returnItems.length === 0 ? (
                    <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} returned briefs.</p>
                ) : (
                    returnItems.map(renderReturnCard)
                )}
            </div>
        </div>
    );
}
