import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface NoteTagsInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
}

// Thin optional tags (T7, docs/Notes_Org_Browse_Design.md NO5) — chip input + chips, no taxonomy
// CMS, no colors, no AI. Plain strings, deduped case-insensitively, trimmed.
export function NoteTagsInput({ tags, onChange }: NoteTagsInputProps) {
    const [draft, setDraft] = useState("");

    const addTag = () => {
        const value = draft.trim();
        if (!value) return;
        if (!tags.some(t => t.toLowerCase() === value.toLowerCase())) onChange([...tags, value]);
        setDraft("");
    };

    const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
        } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1 font-normal text-xs">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive" title={`Remove tag "${tag}"`}>
                        <X className="h-3 w-3" />
                    </button>
                </Badge>
            ))}
            <div className="flex items-center gap-1">
                <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={addTag}
                    placeholder="Add tag…"
                    className="h-6 w-24 text-xs px-2"
                />
                {draft.trim() && (
                    <button type="button" onClick={addTag} title="Add tag" className="text-muted-foreground hover:text-foreground">
                        <Plus className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
