import { Loader2, Tag } from "lucide-react";
import type { JSX } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CodexStatePreview } from "@/features/beats/components/CodexStatePreview";
import { CONCRETE_BEAT_TYPES } from "@/types/beats";
import type { ConcreteBeatType } from "@/types/beats";
import type { LorebookEntry } from "@/types/story";

const NONE_CHARACTER = "none";

interface BeatMarkPopoverProps {
    isMarking: boolean;
    characters: LorebookEntry[];
    onApply: (beatType: ConcreteBeatType, characterId: string | null) => void;
}

/**
 * "Mark Beat" trigger + form: pick a beat type, optionally link a character, and — when a
 * character is linked — see their current concrete Codex state (Task 2's "pull relevant
 * concrete Codex information" requirement) before confirming.
 */
export const BeatMarkPopover = ({ isMarking, characters, onApply }: BeatMarkPopoverProps): JSX.Element => {
    const [open, setOpen] = useState(false);
    const [beatType, setBeatType] = useState<ConcreteBeatType>("physical_action");
    const [characterId, setCharacterId] = useState<string>(NONE_CHARACTER);

    const selectedCharacter = characters.find(character => character.id === characterId);

    const handleApply = () => {
        onApply(beatType, characterId === NONE_CHARACTER ? null : characterId);
        setOpen(false);
        setCharacterId(NONE_CHARACTER);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isMarking}
                    className="flex items-center gap-1"
                    title="Mark the selected text as a concrete beat"
                >
                    {isMarking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
                    <span>Mark Beat</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3" align="start">
                <div className="grid gap-1.5">
                    <Label htmlFor="beat-type-select">Beat Type</Label>
                    <Select value={beatType} onValueChange={value => setBeatType(value as ConcreteBeatType)}>
                        <SelectTrigger id="beat-type-select">
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
                </div>

                {characters.length > 0 && (
                    <div className="grid gap-1.5">
                        <Label htmlFor="beat-character-select">Character (optional)</Label>
                        <Select value={characterId} onValueChange={setCharacterId}>
                            <SelectTrigger id="beat-character-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_CHARACTER}>None</SelectItem>
                                {characters.map(character => (
                                    <SelectItem key={character.id} value={character.id}>
                                        {character.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {selectedCharacter && <CodexStatePreview entry={selectedCharacter} />}

                <Button className="w-full" size="sm" onClick={handleApply} disabled={isMarking}>
                    Mark Beat
                </Button>
            </PopoverContent>
        </Popover>
    );
};
