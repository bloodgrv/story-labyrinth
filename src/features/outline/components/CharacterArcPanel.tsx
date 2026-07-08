import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CharacterArcEntryRow } from "@/features/outline/components/CharacterArcEntryRow";
import { useCharacterArcQuery } from "@/features/outline/hooks/useCharacterArcQuery";
import type { LorebookEntry } from "@/types/story";

interface CharacterArcPanelProps {
    storyId: string;
    characters: LorebookEntry[];
}

// Task 2's "simple arc overview per character": pick a character, see every outline item
// they're linked to in story order with the per-link development note — the ordered sequence of
// notes IS the arc. Deliberately no separate "arc" data model beyond that ordered list of notes.
export function CharacterArcPanel({ storyId, characters }: CharacterArcPanelProps) {
    const [characterId, setCharacterId] = useState<string | undefined>(characters[0]?.id);
    const { data: arc = [], isLoading } = useCharacterArcQuery(storyId, characterId);

    if (characters.length === 0)
        return (
            <EmptyState message="No characters in your Lorebook yet. Add a character to start tracking their arc." />
        );

    const selectedName = characters.find(character => character.id === characterId)?.name;

    return (
        <div className="space-y-4">
            <Select value={characterId} onValueChange={setCharacterId}>
                <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a character" />
                </SelectTrigger>
                <SelectContent>
                    {characters.map(character => (
                        <SelectItem key={character.id} value={character.id}>
                            {character.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {isLoading && <p className="text-sm text-muted-foreground">Loading arc...</p>}

            {!isLoading && characterId && arc.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    {selectedName} isn't linked to any outline items yet. Link them from a chapter or scene in the
                    Outline tab.
                </p>
            )}

            <div className="space-y-2">
                {arc.map((entry, index) => (
                    <CharacterArcEntryRow key={entry.link.id} entry={entry} index={index} />
                ))}
            </div>
        </div>
    );
}
