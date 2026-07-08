import { Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeleteBeatMutation } from "@/features/beats/hooks/useBeatsQuery";
import { cn } from "@/lib/utils";
import { CONCRETE_BEAT_TYPE_MAP } from "@/types/beats";
import type { ConcreteBeat } from "@/types/beats";
import type { LorebookEntry } from "@/types/story";

interface ConfirmedBeatRowProps {
    beat: ConcreteBeat;
    characters: LorebookEntry[];
    chapterId: string;
}

export function ConfirmedBeatRow({ beat, characters, chapterId }: ConfirmedBeatRowProps) {
    const deleteMutation = useDeleteBeatMutation(chapterId);
    const meta = CONCRETE_BEAT_TYPE_MAP[beat.beatType];
    // A characterId may point to a since-deleted entry (FK enforcement is off database-wide in
    // this app — see DECISIONS.md), so this can legitimately be undefined even when set.
    const character = beat.characterId ? characters.find(entry => entry.id === beat.characterId) : undefined;

    return (
        <div className="flex items-start gap-2 rounded-md border p-2">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1">
                    {beat.source === "ai_suggested" && (
                        <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Originally AI-suggested" />
                    )}
                    <Badge variant="outline" className={cn("font-normal", meta.badgeClassName)}>
                        {meta.label}
                    </Badge>
                    {beat.characterId && (
                        <Badge variant="secondary" className="font-normal">
                            {character?.name ?? "Character removed"}
                        </Badge>
                    )}
                </div>
                <p className="text-sm line-clamp-2">{beat.text}</p>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => deleteMutation.mutate(beat.id)}
                disabled={deleteMutation.isPending}
                title="Remove beat"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
