import { BookPlus, Check, Copy, Star } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeneratedName, NamePoolTier, UsedNameType } from "@/types/nameGenerator";

const TIER_VARIANT: Record<NamePoolTier, "secondary" | "outline" | "default"> = {
    common: "secondary",
    uncommon: "outline",
    rare: "default"
};

interface GeneratedNameRowProps {
    result: GeneratedName;
    nameType: UsedNameType;
    isUsed: boolean;
    onMarkUsed: () => void;
    markUsedPending: boolean;
    onCreateCodexEntry: () => void;
    // NG7 — optional so callers that don't track favorites (there are none left, but keeps this
    // row usable in a context with no favorites data available) don't have to wire a no-op.
    isFavorited?: boolean;
    onToggleFavorite?: () => void;
    favoritePending?: boolean;
}

// Single generated-name result: tier badge + pool attribution, then Favorite / Copy / Use /
// Create Codex Entry actions. "Use" records the pick in the used-names ledger (source:
// "generated") so future generates in this story (and its series siblings) exclude it — see
// nameGeneratorService.ts. "Favorite" is a separate, independent pin (NG7) — a name can be
// favorited without being used, or vice versa. "Create Codex Entry" is the manual-only path
// locked decision #6 requires: it hands off to the Lorebook tool's existing CreateEntryDialog
// pre-fill mechanism (pendingLorebookSeed) rather than silently creating anything itself.
export function GeneratedNameRow({
    result,
    nameType,
    isUsed,
    onMarkUsed,
    markUsedPending,
    onCreateCodexEntry,
    isFavorited,
    onToggleFavorite,
    favoritePending
}: GeneratedNameRowProps) {
    const copyName = () => {
        navigator.clipboard.writeText(result.name);
        toast.success("Copied to clipboard");
    };

    return (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{result.name}</span>
                <Badge variant={TIER_VARIANT[result.tier]} className="capitalize shrink-0">
                    {result.tier}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">{result.poolName}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {onToggleFavorite && (
                    <Button
                        variant="ghost"
                        size="icon"
                        title={isFavorited ? "Remove favorite" : "Favorite"}
                        onClick={onToggleFavorite}
                        disabled={favoritePending}
                    >
                        <Star className={cn("h-4 w-4", isFavorited && "fill-current text-amber-500")} />
                    </Button>
                )}
                <Button variant="ghost" size="icon" title="Copy" onClick={copyName}>
                    <Copy className="h-4 w-4" />
                </Button>
                <Button
                    variant={isUsed ? "secondary" : "ghost"}
                    size="sm"
                    title={isUsed ? "Already marked as used" : `Mark used (${nameType})`}
                    onClick={onMarkUsed}
                    disabled={isUsed || markUsedPending}
                >
                    <Check className="h-4 w-4 mr-1" />
                    {isUsed ? "Used" : "Use"}
                </Button>
                {nameType !== "surname" && (
                    <Button variant="ghost" size="sm" title="Create Codex entry from this name" onClick={onCreateCodexEntry}>
                        <BookPlus className="h-4 w-4 mr-1" />
                        Codex
                    </Button>
                )}
            </div>
        </div>
    );
}
