import { attemptPromise } from "@jfdi/attempt";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { BeatTypeLegend } from "@/features/beats/components/BeatTypeLegend";
import { ConfirmedBeatRow } from "@/features/beats/components/ConfirmedBeatRow";
import { SuggestedBeatCard } from "@/features/beats/components/SuggestedBeatCard";
import { useBeatsQuery, useRejectAllBeatsMutation } from "@/features/beats/hooks/useBeatsQuery";
import { useDetectBeatsMutation } from "@/features/beats/hooks/useDetectBeatsMutation";
import { useLorebookContext } from "@/features/lorebook/context/LorebookContext";
import { useAutoDetectBeats } from "@/lib/useAutoDetectBeats";

interface ConcreteBeatsPanelProps {
    chapterId: string;
    storyId: string;
}

export function ConcreteBeatsPanel({ chapterId, storyId }: ConcreteBeatsPanelProps) {
    const { data: beats = [], isLoading } = useBeatsQuery(chapterId);
    const { entries: lorebookEntries } = useLorebookContext();
    const detectMutation = useDetectBeatsMutation(chapterId);
    const rejectAllMutation = useRejectAllBeatsMutation(chapterId);
    const [autoDetectEnabled, setAutoDetectEnabled] = useAutoDetectBeats();

    const pendingBeats = beats.filter(beat => beat.status === "pending");
    const confirmedBeats = beats.filter(beat => beat.status === "confirmed");

    // Unlike the silent background auto-detect trigger in SaveChapterContentPlugin, this manual
    // button gives full success/error feedback since the user is actively watching for it.
    const handleSuggestBeats = async () => {
        const [error, result] = await attemptPromise(() => detectMutation.mutateAsync(storyId));
        if (error) {
            toast.error("Failed to detect beats");
            return;
        }
        if (!result.success) {
            toast.error(result.message ?? "Failed to detect beats");
            return;
        }
        const count = result.suggestions?.length ?? 0;
        toast.success(count > 0 ? `${count} beat suggestion${count === 1 ? "" : "s"} ready to review` : "No new beats found");
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button size="sm" onClick={handleSuggestBeats} disabled={detectMutation.isPending}>
                    {detectMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Suggest Beats
                </Button>
                <div className="flex items-center gap-2">
                    <Label htmlFor="auto-detect-beats" className="text-sm font-normal text-muted-foreground">
                        Auto-detect on save
                    </Label>
                    <Switch id="auto-detect-beats" checked={autoDetectEnabled} onCheckedChange={setAutoDetectEnabled} />
                    <BeatTypeLegend />
                </div>
            </div>

            {pendingBeats.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Suggested Beats ({pendingBeats.length})</h4>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => rejectAllMutation.mutate()}
                            disabled={rejectAllMutation.isPending}
                        >
                            Reject All
                        </Button>
                    </div>
                    {pendingBeats.map(beat => (
                        <SuggestedBeatCard key={beat.id} beat={beat} characters={lorebookEntries} chapterId={chapterId} />
                    ))}
                </div>
            )}

            <div className="space-y-2">
                {pendingBeats.length > 0 && <h4 className="text-sm font-medium">Confirmed Beats</h4>}
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {!isLoading && confirmedBeats.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                        No beats marked yet. Select text in the editor and click <strong>Mark Beat</strong>, or use
                        "Suggest Beats" above.
                    </p>
                )}
                {confirmedBeats.map(beat => (
                    <ConfirmedBeatRow key={beat.id} beat={beat} characters={lorebookEntries} chapterId={chapterId} />
                ))}
            </div>
        </div>
    );
}
