import { UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    useLinkCharacterMutation,
    useOutlineItemCharacterLinksQuery,
    useUnlinkCharacterMutation
} from "@/features/outline/hooks/useOutlineCharacterLinks";
import type { LorebookEntry } from "@/types/story";

interface OutlineCharacterChipsProps {
    outlineItemId: string;
    storyId: string;
    characters: LorebookEntry[];
}

// Shared by both chapter and scene rows (Task 2): shows every character currently linked to this
// outline item as a removable chip, plus a small picker to link another. Linking here always
// starts with an empty arcNote — the note itself is edited from the Character Arcs tab
// (CharacterArcPanel), which is where it's actually read back in context, not from this compact
// row-level chip list.
export function OutlineCharacterChips({ outlineItemId, storyId, characters }: OutlineCharacterChipsProps) {
    const { data: links = [] } = useOutlineItemCharacterLinksQuery(outlineItemId);
    const linkMutation = useLinkCharacterMutation();
    const unlinkMutation = useUnlinkCharacterMutation(outlineItemId);
    const [pickerOpen, setPickerOpen] = useState(false);

    const linkedIds = new Set(links.map(link => link.characterId));
    const available = characters.filter(character => !linkedIds.has(character.id));

    const handleLink = (characterId: string) => {
        linkMutation.mutate({ outlineItemId, storyId, characterId, arcNote: null });
        setPickerOpen(false);
    };

    return (
        <div className="flex flex-wrap items-center gap-1">
            {links.map(link => {
                const character = characters.find(entry => entry.id === link.characterId);
                return (
                    <Badge key={link.id} variant="secondary" className="gap-1 font-normal">
                        {character?.name ?? "Character removed"}
                        <button
                            type="button"
                            onClick={() => unlinkMutation.mutate(link.id)}
                            className="hover:text-destructive"
                            aria-label={`Unlink ${character?.name ?? "character"}`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                );
            })}
            {available.length > 0 && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-5 w-5" title="Link a character">
                            <UserPlus className="h-3 w-3" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-1" align="start">
                        <div className="max-h-56 overflow-auto">
                            {available.map(character => (
                                <button
                                    key={character.id}
                                    type="button"
                                    onClick={() => handleLink(character.id)}
                                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                                >
                                    {character.name}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
