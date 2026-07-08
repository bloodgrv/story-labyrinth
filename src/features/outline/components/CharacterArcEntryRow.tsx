import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCharacterLinkMutation } from "@/features/outline/hooks/useOutlineCharacterLinks";
import type { CharacterArcEntry } from "@/types/outline";

interface CharacterArcEntryRowProps {
    entry: CharacterArcEntry;
    index: number;
}

// One stop on a character's arc: which outline item, and a free-text note on their development
// at that point — saved on blur (not per-keystroke) since it's simple prose, not a field with
// any need for live validation.
export function CharacterArcEntryRow({ entry, index }: CharacterArcEntryRowProps) {
    const { outlineItem, link } = entry;
    const [note, setNote] = useState(link.arcNote ?? "");
    const updateMutation = useUpdateCharacterLinkMutation(outlineItem.id);

    const handleBlur = () => {
        const trimmed = note.trim();
        if (trimmed === (link.arcNote ?? "")) return;
        updateMutation.mutate({ id: link.id, data: { arcNote: trimmed ? trimmed : null } });
    };

    return (
        <div className="space-y-1.5 rounded-md border p-3">
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{index + 1}.</span>
                <Badge variant="outline" className="font-normal">
                    {outlineItem.type === "chapter" ? "Chapter" : "Scene"}
                </Badge>
                <span className="text-sm font-medium">{outlineItem.title}</span>
            </div>
            <Textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                onBlur={handleBlur}
                placeholder="What happens to this character here?"
                rows={2}
                className="text-sm"
            />
        </div>
    );
}
