import { Badge } from "@/components/ui/badge";
import type { CodexState } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";

const SECTIONS: { key: keyof Pick<CodexState, "wardrobe" | "appearance" | "wounds" | "items">; label: string }[] = [
    { key: "wardrobe", label: "Wardrobe" },
    { key: "appearance", label: "Appearance" },
    { key: "wounds", label: "Wounds" },
    { key: "items", label: "Items" }
];

interface CodexStatePreviewProps {
    entry: LorebookEntry;
}

/**
 * Read-only summary of a character's concrete Codex state (wardrobe/appearance/wounds/items) —
 * the "pull relevant concrete Codex information" surface for the beat-marking flow. Deliberately
 * omits anything psychological/thematic since CodexState itself only tracks concrete fields.
 */
export function CodexStatePreview({ entry }: CodexStatePreviewProps) {
    if (!entry.codexEnabled || !entry.codexState)
        return <p className="text-xs text-muted-foreground">No Codex state tracked for {entry.name} yet.</p>;

    const state = entry.codexState;
    const sectionsWithItems = SECTIONS.filter(section => state[section.key]?.length > 0);

    if (sectionsWithItems.length === 0)
        return <p className="text-xs text-muted-foreground">{entry.name}&rsquo;s Codex is empty so far.</p>;

    return (
        <div className="space-y-1.5 rounded-md border p-2">
            <p className="text-xs font-medium text-muted-foreground">Current state — {entry.name}</p>
            {sectionsWithItems.map(section => (
                <div key={section.key} className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{section.label}:</span>
                    {state[section.key].map(item => (
                        <Badge key={"id" in item ? item.id : item.key} variant="outline" className="text-xs font-normal">
                            {"label" in item && item.label ? `${item.label}: ${item.value}` : item.value}
                        </Badge>
                    ))}
                </div>
            ))}
        </div>
    );
}
