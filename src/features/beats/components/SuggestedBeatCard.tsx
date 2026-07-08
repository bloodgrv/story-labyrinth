import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    useAcceptBeatMutation,
    useRejectBeatMutation,
    useUpdateBeatMutation
} from "@/features/beats/hooks/useBeatsQuery";
import { cn } from "@/lib/utils";
import { CONCRETE_BEAT_TYPES, CONCRETE_BEAT_TYPE_MAP } from "@/types/beats";
import type { ConcreteBeat, ConcreteBeatType } from "@/types/beats";
import type { LorebookEntry } from "@/types/story";

const NONE_CHARACTER = "none";

interface SuggestedBeatCardProps {
    beat: ConcreteBeat;
    characters: LorebookEntry[];
    chapterId: string;
}

/**
 * A single pending AI suggestion — visually distinct from confirmed beats (dashed amber border
 * + "AI Suggested" badge) with Accept / Edit / Reject actions, per Task 3's requirements.
 */
export function SuggestedBeatCard({ beat, characters, chapterId }: SuggestedBeatCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [beatType, setBeatType] = useState<ConcreteBeatType>(beat.beatType);
    const [characterId, setCharacterId] = useState(beat.characterId ?? NONE_CHARACTER);

    const acceptMutation = useAcceptBeatMutation(chapterId);
    const rejectMutation = useRejectBeatMutation(chapterId);
    const updateMutation = useUpdateBeatMutation(chapterId);

    const character = beat.characterId ? characters.find(entry => entry.id === beat.characterId) : undefined;
    const meta = CONCRETE_BEAT_TYPE_MAP[beat.beatType];
    const isBusy = acceptMutation.isPending || rejectMutation.isPending || updateMutation.isPending;

    const handleSaveEdit = () => {
        updateMutation.mutate(
            { id: beat.id, data: { beatType, characterId: characterId === NONE_CHARACTER ? null : characterId } },
            { onSuccess: () => setIsEditing(false) }
        );
    };

    return (
        <div className="rounded-md border border-dashed border-amber-400/60 bg-amber-50/50 p-2 space-y-1.5 dark:bg-amber-950/10">
            <div className="flex flex-wrap items-center gap-1">
                <Badge
                    variant="outline"
                    className="gap-1 font-normal border-amber-400/60 text-amber-800 dark:text-amber-300"
                >
                    <Sparkles className="h-3 w-3" />
                    AI Suggested
                </Badge>
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

            {isEditing && (
                <div className="space-y-2 pt-1">
                    <Select value={beatType} onValueChange={value => setBeatType(value as ConcreteBeatType)}>
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CONCRETE_BEAT_TYPES.map(type => (
                                <SelectItem key={type.id} value={type.id}>
                                    {type.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {characters.length > 0 && (
                        <Select value={characterId} onValueChange={setCharacterId}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_CHARACTER}>None</SelectItem>
                                {characters.map(entry => (
                                    <SelectItem key={entry.id} value={entry.id}>
                                        {entry.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button
                        size="sm"
                        className="h-7 w-full text-xs"
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                    >
                        Save Changes
                    </Button>
                </div>
            )}

            <div className="flex gap-1.5">
                <Button size="sm" className="h-7 flex-1 text-xs" onClick={() => acceptMutation.mutate(beat)} disabled={isBusy}>
                    <Check className="h-3 w-3 mr-1" />
                    Accept
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setIsEditing(value => !value)}
                    disabled={isBusy}
                >
                    {isEditing ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                    Edit
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    onClick={() => rejectMutation.mutate(beat.id)}
                    disabled={isBusy}
                >
                    <X className="h-3 w-3 mr-1" />
                    Reject
                </Button>
            </div>
        </div>
    );
}
