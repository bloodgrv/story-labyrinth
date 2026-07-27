import { BookPlus, Check, Copy, Loader2, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import {
    useAddFavoriteMutation,
    useFavoritesQuery,
    useGenerateNamesMutation,
    useMarkNameUsedMutation,
    useRemoveFavoriteMutation,
    useUsedNamesQuery
} from "@/features/name-generator/hooks/useNameGeneratorQuery";
import type { GenerateNamesResponse, UsedNameType } from "@/types/nameGenerator";
import type { ParsedNameProposal } from "../services/parseNameProposal";

interface NameProposalCardProps {
    proposal: ParsedNameProposal;
    storyId: string;
}

const kindToNameType = (kind: ParsedNameProposal["kind"]): UsedNameType =>
    kind === "surname" ? "surname" : kind === "full_name" ? "full" : "first";

interface CompactNameChipProps {
    name: string;
    isUsed: boolean;
    onMarkUsed: () => void;
    markUsedPending: boolean;
    onCreateCodexEntry?: () => void;
    isFavorited: boolean;
    onToggleFavorite: () => void;
    favoritePending: boolean;
}

// Chat-card-only presentation — deliberately NOT the panel's GeneratedNameRow/GeneratedNamePairRow
// (tier badge + pool-name text + labeled buttons). That's fine at full panel width but unreadable
// packed into an 85%-width chat bubble, especially for full_name pairs (two tier badges + two pool
// names). Here: just the name plus icon-only actions in a wrapping chip, so 8 suggestions take a
// few short lines instead of 8 stacked full-width rows. Tier/pool attribution is dropped entirely
// for this surface — still visible in the main Name Generator panel for anyone who wants it.
function CompactNameChip({
    name,
    isUsed,
    onMarkUsed,
    markUsedPending,
    onCreateCodexEntry,
    isFavorited,
    onToggleFavorite,
    favoritePending
}: CompactNameChipProps) {
    const copyName = () => {
        navigator.clipboard.writeText(name);
        toast.success("Copied to clipboard");
    };

    return (
        <div className="flex items-center gap-0.5 rounded-full border bg-muted/30 pl-3 pr-1 py-1">
            <span className="text-sm font-medium truncate max-w-[10rem]">{name}</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={isFavorited ? "Remove favorite" : "Favorite"}
                onClick={onToggleFavorite}
                disabled={favoritePending}
            >
                <Star className={cn("h-3.5 w-3.5", isFavorited && "fill-current text-amber-500")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Copy" onClick={copyName}>
                <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant={isUsed ? "secondary" : "ghost"}
                size="icon"
                className="h-6 w-6"
                title={isUsed ? "Already marked as used" : "Mark used"}
                onClick={onMarkUsed}
                disabled={isUsed || markUsedPending}
            >
                <Check className="h-3.5 w-3.5" />
            </Button>
            {onCreateCodexEntry && (
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Create Codex entry from this name" onClick={onCreateCodexEntry}>
                    <BookPlus className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    );
}

// NG6 — sibling to PsychProposalCard/ProseProposalCard, but there's no single value to Accept/
// Reject: the model is requesting the (non-LLM, deterministic) generate action run, so this card
// runs it once on mount and renders results via CompactNameChip above. Never writes anything on
// its own; only "Use" (marks used) or "Create Codex" (opens the review dialog) do.
export function NameProposalCard({ proposal, storyId }: NameProposalCardProps) {
    const { setPendingLorebookSeed, setCurrentTool } = useStoryContext();
    const [result, setResult] = useState<GenerateNamesResponse | null>(null);
    const hasGenerated = useRef(false);

    const generateMutation = useGenerateNamesMutation();
    const markUsedMutation = useMarkNameUsedMutation();
    const { data: usedData } = useUsedNamesQuery(storyId);
    const { data: favoritesData } = useFavoritesQuery(storyId);
    const addFavoriteMutation = useAddFavoriteMutation();
    const removeFavoriteMutation = useRemoveFavoriteMutation();

    useEffect(() => {
        if (hasGenerated.current) return;
        hasGenerated.current = true;
        generateMutation.mutate(
            {
                storyId,
                kind: proposal.kind,
                gender: proposal.gender,
                region: proposal.region,
                era: proposal.era,
                count: proposal.count
            },
            { onSuccess: setResult }
        );
        // Fires once per card instance — proposal/storyId are stable for the message this card
        // renders for, and generateMutation is a fresh object every render (react-query).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const nameType = kindToNameType(proposal.kind);
    const usedNameSet = new Set((usedData?.usedNames ?? []).filter(u => u.nameType === nameType).map(u => u.name.toLowerCase()));
    const favoritedNames = new Set(
        (favoritesData?.favorites ?? []).filter(f => f.nameType === nameType).map(f => f.name.toLowerCase())
    );

    const handleCreateCodexEntry = (name: string) => {
        setPendingLorebookSeed({ name, category: "character", blurb: "Needs fleshing out — generated by the Name Generator." });
        setCurrentTool("lorebook");
    };

    const handleToggleFavorite = (name: string, poolId: string | undefined) => {
        const existing = favoritesData?.favorites.find(f => f.nameType === nameType && f.name.toLowerCase() === name.toLowerCase());
        if (existing) removeFavoriteMutation.mutate({ storyId, id: existing.id });
        else addFavoriteMutation.mutate({ storyId, name, nameType, poolId });
    };

    const kindLabel = proposal.kind === "first_name" ? "First name" : proposal.kind === "surname" ? "Surname" : "Full name";

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Name Generator
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                        {kindLabel} suggestions
                        {proposal.region ? ` — ${proposal.region}` : ""}
                    </span>
                </div>
            </CardHeader>
            <CardContent>
                {generateMutation.isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                    </div>
                )}
                {proposal.kind === "full_name" ? (
                    <>
                        {result && (!result.pairs || result.pairs.length === 0) && (
                            <p className="text-sm text-muted-foreground">No names matched those filters.</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {result?.pairs?.map((pair, index) => {
                                const fullName = `${pair.firstName.name} ${pair.lastName.name}`;
                                return (
                                    <CompactNameChip
                                        key={`${pair.firstName.poolId}-${pair.lastName.poolId}-${fullName}-${index}`}
                                        name={fullName}
                                        isUsed={usedNameSet.has(fullName.toLowerCase())}
                                        markUsedPending={markUsedMutation.isPending}
                                        onMarkUsed={() =>
                                            markUsedMutation.mutate({ storyId, name: fullName, nameType, source: "generated", poolNameId: undefined })
                                        }
                                        onCreateCodexEntry={() => handleCreateCodexEntry(fullName)}
                                        isFavorited={favoritedNames.has(fullName.toLowerCase())}
                                        favoritePending={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                                        onToggleFavorite={() => handleToggleFavorite(fullName, undefined)}
                                    />
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <>
                        {result?.names.length === 0 && (
                            <p className="text-sm text-muted-foreground">No names matched those filters.</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {result?.names.map((name, index) => (
                                <CompactNameChip
                                    key={`${name.poolId}-${name.name}-${index}`}
                                    name={name.name}
                                    isUsed={usedNameSet.has(name.name.toLowerCase())}
                                    markUsedPending={markUsedMutation.isPending}
                                    onMarkUsed={() =>
                                        markUsedMutation.mutate({ storyId, name: name.name, nameType, source: "generated", poolNameId: undefined })
                                    }
                                    onCreateCodexEntry={nameType !== "surname" ? () => handleCreateCodexEntry(name.name) : undefined}
                                    isFavorited={favoritedNames.has(name.name.toLowerCase())}
                                    favoritePending={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                                    onToggleFavorite={() => handleToggleFavorite(name.name, name.poolId)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
