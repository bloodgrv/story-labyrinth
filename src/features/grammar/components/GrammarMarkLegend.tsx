import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Reference for the wavy-underline colour each grammar category renders as inline in the editor
 * (PlaygroundEditorTheme.css's `.grammar-mark--<category>` rules use the same 3 hues). Mirrors
 * BeatTypeLegend.tsx / RagIssueSeverityLegend.tsx's pattern.
 */
const CATEGORIES = [
    { id: "spelling", label: "Spelling", swatch: "rgba(239, 68, 68, 0.9)", description: "Misspelled word" },
    { id: "grammar", label: "Grammar", swatch: "rgba(59, 130, 246, 0.9)", description: "Grammatical issue" },
    { id: "style", label: "Style", swatch: "rgba(16, 185, 129, 0.9)", description: "Style suggestion" }
];

export function GrammarMarkLegend() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Grammar colour key">
                    <Info className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="end">
                <p className="text-xs font-medium text-muted-foreground">Inline underline colours (Grammar Checker)</p>
                <div className="flex flex-col gap-1.5">
                    {CATEGORIES.map(category => (
                        <div key={category.id} className="flex items-center gap-2">
                            <span
                                className="inline-block h-0 w-6 border-b-2 border-dotted shrink-0"
                                style={{ borderBottomColor: category.swatch }}
                            />
                            <span className="text-xs font-medium">{category.label}</span>
                            <span className="text-xs text-muted-foreground">{category.description}</span>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                    Wavy underline = Grammar Checker. A solid underline is a separate RAG Scanner issue.
                </p>
            </PopoverContent>
        </Popover>
    );
}
