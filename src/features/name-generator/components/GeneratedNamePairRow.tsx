import { BookPlus, Check, Copy, Star } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GeneratedNamePair, NamePoolTier } from "@/types/nameGenerator";

const TIER_VARIANT: Record<NamePoolTier, "secondary" | "outline" | "default"> = {
    common: "secondary",
    uncommon: "outline",
    rare: "default"
};

interface GeneratedNamePairRowProps {
    pair: GeneratedNamePair;
    isUsed: boolean;
    onMarkUsed: () => void;
    markUsedPending: boolean;
    onCreateCodexEntry: () => void;
    isFavorited?: boolean;
    onToggleFavorite?: () => void;
    favoritePending?: boolean;
}

// Sibling to GeneratedNameRow, for kind: "full_name" results — a first name and surname drawn
// independently (nameGeneratorService.ts's generateFullNamePairs) and displayed as one unit.
// Use/Favorite/Codex all key off the combined "First Last" string under the "full" UsedNameType,
// which already existed in the schema for exactly this pairing case.
export function GeneratedNamePairRow({
    pair,
    isUsed,
    onMarkUsed,
    markUsedPending,
    onCreateCodexEntry,
    isFavorited,
    onToggleFavorite,
    favoritePending
}: GeneratedNamePairRowProps) {
    const fullName = `${pair.firstName.name} ${pair.lastName.name}`;

    const copyName = () => {
        navigator.clipboard.writeText(fullName);
        toast.success("Copied to clipboard");
    };

    return (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-medium truncate">{fullName}</span>
                <Badge variant={TIER_VARIANT[pair.firstName.tier]} className="capitalize shrink-0">
                    {pair.firstName.tier}
                </Badge>
                <Badge variant={TIER_VARIANT[pair.lastName.tier]} className="capitalize shrink-0">
                    {pair.lastName.tier}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                    {pair.firstName.poolName} + {pair.lastName.poolName}
                </span>
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
                    title={isUsed ? "Already marked as used" : "Mark used"}
                    onClick={onMarkUsed}
                    disabled={isUsed || markUsedPending}
                >
                    <Check className="h-4 w-4 mr-1" />
                    {isUsed ? "Used" : "Use"}
                </Button>
                <Button variant="ghost" size="sm" title="Create Codex entry from this name" onClick={onCreateCodexEntry}>
                    <BookPlus className="h-4 w-4 mr-1" />
                    Codex
                </Button>
            </div>
        </div>
    );
}
