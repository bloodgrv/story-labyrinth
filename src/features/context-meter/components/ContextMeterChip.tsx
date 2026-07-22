import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContextEstimate } from "../hooks/useContextEstimate";
import { formatTokenCount as formatK } from "../lib/estimateTokens";

// Thresholds are the design doc's own suggested example values (§ "Colors: calm -> amber -> red").
const AMBER_THRESHOLD = 0.7;
const RED_THRESHOLD = 0.9;

const barColor = (pctUsed: number | null): string => {
    if (pctUsed === null) return "bg-muted-foreground/40";
    if (pctUsed >= RED_THRESHOLD) return "bg-destructive";
    if (pctUsed >= AMBER_THRESHOLD) return "bg-amber-500";
    return "bg-primary";
};

interface ContextMeterChipProps {
    estimate: ContextEstimate;
}

// Context/Token Meter (T4) — M2. Chip is always the "est." shape in v1 (no server-side refine
// pass implemented this pass — see DECISIONS.md), matching the design doc's own "if refine fails,
// keep heuristic and mark UI as est." fallback text.
export function ContextMeterChip({ estimate }: ContextMeterChipProps) {
    const { slices, total, limit, pctUsed } = estimate;
    if (total === 0) return null;

    const pctLeft = pctUsed !== null ? Math.max(0, Math.round((1 - pctUsed) * 100)) : null;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Estimated context window usage — click to expand"
                >
                    {limit ? (
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all", barColor(pctUsed))}
                                style={{ width: `${Math.min(100, Math.round((pctUsed ?? 0) * 100))}%` }}
                            />
                        </div>
                    ) : null}
                    <span>
                        {formatK(total)}
                        {limit ? ` / ${formatK(limit)}` : ""} tokens (est.)
                        {pctLeft !== null ? ` · ${pctLeft}% left` : ""}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-xs space-y-1.5" align="start">
                <p className="font-medium text-sm mb-1">Context breakdown (est.)</p>
                {slices.map(s => (
                    <div key={s.label} className="flex justify-between">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span>{formatK(s.tokens)}</span>
                    </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 font-medium">
                    <span>Total</span>
                    <span>
                        {formatK(total)}
                        {limit ? ` / ${formatK(limit)}` : ""}
                    </span>
                </div>
            </PopoverContent>
        </Popover>
    );
}
