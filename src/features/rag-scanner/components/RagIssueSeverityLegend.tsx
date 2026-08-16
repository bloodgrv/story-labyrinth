import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Reference for the underline colour each RAG Scanner severity renders as inline in the editor
 * (PlaygroundEditorTheme.css's `.rag-issue-mark--<severity>` rules use the same 3 hues). Mirrors
 * BeatTypeLegend.tsx's pattern for the same reason: the mapping shouldn't have to be memorized.
 */
const SEVERITIES = [
    { id: "low", label: "Low", swatch: "rgba(245, 158, 11, 0.9)", description: "Minor or unconfirmed inconsistency" },
    { id: "medium", label: "Medium", swatch: "rgba(249, 115, 22, 0.9)", description: "Likely contradiction, worth a look" },
    { id: "high", label: "High", swatch: "rgba(219, 39, 119, 0.9)", description: "Clear contradiction against the Codex or prior chapters" }
];

export function RagIssueSeverityLegend() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Severity colour key">
                    <Info className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="end">
                <p className="text-xs font-medium text-muted-foreground">Inline underline colours (Scanner)</p>
                <div className="flex flex-col gap-1.5">
                    {SEVERITIES.map(severity => (
                        <div key={severity.id} className="flex items-center gap-2">
                            <span
                                className="inline-block h-0 w-6 border-b-2 shrink-0"
                                style={{ borderBottomColor: severity.swatch }}
                            />
                            <span className="text-xs font-medium">{severity.label}</span>
                            <span className="text-xs text-muted-foreground">{severity.description}</span>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                    Solid underline = Scanner issue. A wavy underline is a separate Grammar Checker flag.
                </p>
            </PopoverContent>
        </Popover>
    );
}
