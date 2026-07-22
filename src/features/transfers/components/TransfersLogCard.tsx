import { ArrowRight, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { useStoryContext, type WorkspaceTool } from "@/features/stories/context/StoryContext";
import { useTransfersQuery } from "@/features/transfers/hooks/useTransfersQuery";
import { chatsApi } from "@/services/api/client";
import type { DeskTransfer } from "@/types/deskTransfer";

// Transfer Log UI (T2, docs/Transfer_Log_And_Settings_IA_Design.md) — Settings -> Logs -> Transfers.
// Story picker is independent of whatever story is currently open in the workspace (design's own
// decision #6) — this card is reachable from a top-level Settings page, not a story's own tools.

const DESK_LABELS: Record<string, string> = {
    editor: "Editor",
    outline: "Outline",
    worldbuilding: "World-Building",
    lorebook: "Lorebook",
    brainstorm: "Brainstorm",
    research: "Research",
    notes: "Notes",
    general: "General"
};
const deskLabel = (desk: string): string => DESK_LABELS[desk] ?? desk;

const KIND_LABELS: Record<DeskTransfer["kind"], string> = {
    shuttle: "Shuttle",
    shuttle_return: "Shuttle return",
    handoff: "Handoff",
    overview_proposal: "Overview note",
    lore_suggestion: "Lore suggestion",
    highlight_to_notes: "Highlight → Note"
};

// A chat-composer destination for every kind except worldbuilding (pendingLorebookSeed instead) —
// mirrors the exact branch every handoff/lore-suggestion dispatch site already uses.
const isLorebookDesk = (desk: string): boolean => desk === "worldbuilding" || desk === "lorebook";

export function TransfersLogCard() {
    const navigate = useNavigate();
    const { data: stories = [] } = useStoriesQuery();
    const [storyId, setStoryId] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [search, setSearch] = useState("");
    const { setCurrentStoryId, setCurrentTool, setPendingLorebookSeed, setPendingChatComposerSeed } = useStoryContext();

    const effectiveStoryId = storyId ?? stories[0]?.id ?? null;
    const transfersQuery = useTransfersQuery(effectiveStoryId, showAll);
    const [busyId, setBusyId] = useState<string | null>(null);

    const transfers = useMemo(() => {
        const all = transfersQuery.data?.transfers ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return all;
        return all.filter(
            t =>
                t.subject.toLowerCase().includes(q) ||
                t.fromDesk.toLowerCase().includes(q) ||
                t.toDesk.toLowerCase().includes(q) ||
                (t.fromChatTitleSnapshot ?? "").toLowerCase().includes(q) ||
                (t.toChatTitleSnapshot ?? "").toLowerCase().includes(q)
        );
    }, [transfersQuery.data, search]);

    // Open origin — story + desk navigation only (context is app-wide, shared with the Workspace
    // route). Selecting the specific origin chat within that desk isn't wired (would need every
    // rail to accept an incoming "select this chat" instruction) — best-effort per decision #10,
    // a toast names the chat to look for instead.
    const handleOpenOrigin = async (transfer: DeskTransfer) => {
        if (!transfer.fromChatId) {
            toast.error("No origin chat recorded for this transfer.");
            return;
        }
        setBusyId(transfer.id);
        try {
            await chatsApi.getById(transfer.fromChatId);
            setCurrentStoryId(transfer.storyId);
            setCurrentTool(transfer.fromDesk as WorkspaceTool);
            toast.info(`Opened ${deskLabel(transfer.fromDesk)} — look for "${transfer.fromChatTitleSnapshot ?? "this chat"}" in the chat list.`);
            navigate("/");
        } catch {
            toast.error("That origin chat no longer exists.");
        } finally {
            setBusyId(null);
        }
    };

    // Re-seed destination — replay subject(+crumb) via the same pending-seed mechanisms every
    // live writer already uses. Never auto-sends/generates, and never writes a new transfer row
    // (decision #10 — a re-seed is not itself a new send).
    const handleReseed = (transfer: DeskTransfer) => {
        const text = transfer.crumb ? `${transfer.subject}\n\n(Context: ${transfer.crumb})` : transfer.subject;
        setCurrentStoryId(transfer.storyId);
        if (isLorebookDesk(transfer.toDesk)) {
            setPendingLorebookSeed({ name: transfer.subject.slice(0, 60), category: "character", blurb: text });
            setCurrentTool("lorebook");
        } else {
            setPendingChatComposerSeed({ tool: transfer.toDesk as WorkspaceTool, text });
            setCurrentTool(transfer.toDesk as WorkspaceTool);
        }
        toast.info(`Re-seeded ${deskLabel(transfer.toDesk)} with this transfer's content.`);
        navigate("/");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Transfers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                    <Select value={effectiveStoryId ?? undefined} onValueChange={setStoryId}>
                        <SelectTrigger className="w-56">
                            <SelectValue placeholder="Select a story" />
                        </SelectTrigger>
                        <SelectContent>
                            {stories.map(story => (
                                <SelectItem key={story.id} value={story.id}>
                                    {story.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Search subject, desk, chat..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                    <div className="flex items-center gap-2 ml-auto">
                        <Switch id="transfers-show-all" checked={showAll} onCheckedChange={setShowAll} />
                        <label htmlFor="transfers-show-all" className="text-xs text-muted-foreground">
                            Show older (up to 90 days)
                        </label>
                    </div>
                </div>

                {!effectiveStoryId ? (
                    <p className="text-sm text-muted-foreground">No stories yet.</p>
                ) : transfersQuery.isLoading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : transfers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                        {showAll ? "No transfers recorded yet." : "No transfers in the last 30 days."}
                    </p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {transfers.map(t => (
                            <div key={t.id} className="rounded border p-3 space-y-1.5">
                                <div className="flex items-center gap-1.5 text-sm flex-wrap">
                                    <Badge variant="secondary" className="text-[10px]">
                                        {KIND_LABELS[t.kind]}
                                    </Badge>
                                    <Badge variant={t.event === "opened" ? "default" : "outline"} className="text-[10px] capitalize">
                                        {t.event}
                                    </Badge>
                                    <span className="text-muted-foreground">{deskLabel(t.fromDesk)}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{deskLabel(t.toDesk)}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm truncate" title={t.subject}>
                                    {t.subject}
                                </p>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => handleOpenOrigin(t)}>
                                        {busyId === t.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
                                        Open origin
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleReseed(t)}>
                                        <RotateCw className="h-3.5 w-3.5 mr-1" />
                                        Re-seed destination
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
