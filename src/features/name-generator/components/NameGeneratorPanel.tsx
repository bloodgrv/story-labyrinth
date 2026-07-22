import { Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { GenerateNamesResponse, NamePoolGender, NamePoolKind, UsedNameType } from "@/types/nameGenerator";
import {
    useAddFavoriteMutation,
    useFavoritesQuery,
    useGenerateNamesMutation,
    useMarkNameUsedMutation,
    usePoolsQuery,
    useRemoveFavoriteMutation,
    useSaveStoryDefaultsMutation,
    useStoryDefaultsQuery,
    useUsedNamesQuery
} from "../hooks/useNameGeneratorQuery";
import { ERA_BUCKETS, NameGeneratorFilters } from "./NameGeneratorFilters";
import { GeneratedNameRow } from "./GeneratedNameRow";
import { ImportPoolDialog } from "./ImportPoolDialog";

// NG7 — keep the last few generate batches instead of replacing the single result each time, so
// hitting Generate again doesn't lose earlier suggestions the user hasn't picked from yet.
const MAX_RECENT_BATCHES = 3;

interface RecentBatch {
    id: string;
    label: string;
    result: GenerateNamesResponse;
    // The kind this batch was generated with — not necessarily the panel's *current* kind
    // selection, if the user switched Surname/First name between generates.
    nameType: UsedNameType;
}

// v1 core coverage (docs/Name_Generator_Design.md v0.4, locked decisions #2/#12) — used as a
// fallback before the region list derived from actual pools (below) has loaded. NG5 import packs
// can bring their own regions, so the Region select is derived from whatever pools actually exist
// for this story rather than staying hardcoded — "Any" exists specifically so an imported pool
// with an unlisted region is still reachable through the panel's own filters.
const FALLBACK_REGIONS = ["US", "UK"];

const kindToNameType = (kind: NamePoolKind): UsedNameType => (kind === "first_name" ? "first" : "surname");

export function NameGeneratorPanel() {
    const { currentStoryId, setPendingLorebookSeed, setCurrentTool } = useStoryContext();
    const [kind, setKind] = useState<NamePoolKind>("first_name");
    const [gender, setGender] = useState<NamePoolGender | "any">("any");
    const [region, setRegion] = useState<string>("any");
    const [era, setEra] = useState<string>("any");
    const [count, setCount] = useState(5);
    const [maxLength, setMaxLength] = useState("");
    const [startsWith, setStartsWith] = useState("");
    const [recentBatches, setRecentBatches] = useState<RecentBatch[]>([]);
    const [importOpen, setImportOpen] = useState(false);

    const storyId = currentStoryId ?? "";
    const generateMutation = useGenerateNamesMutation();
    const markUsedMutation = useMarkNameUsedMutation();
    const saveDefaultsMutation = useSaveStoryDefaultsMutation();
    const { data: usedData } = useUsedNamesQuery(storyId);
    const { data: favoritesData } = useFavoritesQuery(storyId);
    const addFavoriteMutation = useAddFavoriteMutation();
    const removeFavoriteMutation = useRemoveFavoriteMutation();
    // Unfiltered so the Region select reflects whatever pools actually exist (core + any NG5
    // imports), not just the v1 core hardcoded list.
    const { data: allPoolsData } = usePoolsQuery({ storyId });
    const availableRegions = allPoolsData?.pools.length
        ? [...new Set(allPoolsData.pools.map(p => p.region))].sort()
        : FALLBACK_REGIONS;

    // NG7 — apply saved per-story sticky filters once, the first time they load. A ref (not a
    // dependency-gated effect alone) so switching kind/region by hand afterward never gets
    // silently overwritten by a stale refetch.
    const defaultsQuery = useStoryDefaultsQuery(storyId);
    const appliedDefaults = useRef(false);
    useEffect(() => {
        if (appliedDefaults.current || !defaultsQuery.isSuccess) return;
        appliedDefaults.current = true;
        const saved = defaultsQuery.data.defaults;
        if (!saved) return;
        if (saved.era) setEra(saved.era);
        if (saved.region) setRegion(saved.region);
        if (saved.gender) setGender(saved.gender);
    }, [defaultsQuery.isSuccess, defaultsQuery.data]);

    const nameType = kindToNameType(kind);
    // Keyed by name+type together (not one Set for the current kind) — a recent batch generated
    // under a different kind before the user switched tabs must still check against its own type.
    const isNameUsed = (name: string, type: UsedNameType) =>
        (usedData?.usedNames ?? []).some(u => u.nameType === type && u.name.toLowerCase() === name.toLowerCase());
    const favoriteKey = (name: string, type: UsedNameType) => `${name.toLowerCase()}::${type}`;
    const favoritesByKey = new Map((favoritesData?.favorites ?? []).map(f => [favoriteKey(f.name, f.nameType), f]));

    const describeFilters = (): string => {
        const parts = [kind === "first_name" ? "First name" : "Surname"];
        if (kind === "first_name" && gender !== "any") parts.push(gender);
        if (region !== "any") parts.push(region);
        if (kind === "first_name" && era !== "any") parts.push(ERA_BUCKETS.find(b => b.value === era)?.label ?? era);
        return parts.join(" · ");
    };

    const handleGenerate = () => {
        const label = describeFilters();
        generateMutation.mutate(
            {
                storyId,
                kind,
                gender: kind === "first_name" && gender !== "any" ? gender : undefined,
                region: region === "any" ? undefined : region,
                era: era === "any" ? undefined : era,
                count,
                maxLength: maxLength ? Number(maxLength) : undefined,
                startsWith: startsWith || undefined
            },
            {
                onSuccess: data => {
                    setRecentBatches(prev => [{ id: crypto.randomUUID(), label, result: data, nameType }, ...prev].slice(0, MAX_RECENT_BATCHES));
                    saveDefaultsMutation.mutate({
                        storyId,
                        era: kind === "first_name" && era !== "any" ? era : null,
                        region: region === "any" ? null : region,
                        gender: kind === "first_name" && gender !== "any" ? gender : null
                    });
                }
            }
        );
    };

    const handleCreateCodexEntry = (name: string) => {
        setPendingLorebookSeed({ name, category: "character", blurb: "Needs fleshing out — generated by the Name Generator." });
        setCurrentTool("lorebook");
    };

    const handleToggleFavorite = (name: string, type: UsedNameType, poolId: string) => {
        const existing = favoritesByKey.get(favoriteKey(name, type));
        if (existing) removeFavoriteMutation.mutate({ storyId, id: existing.id });
        else addFavoriteMutation.mutate({ storyId, name, nameType: type, poolId });
    };

    if (!currentStoryId) return null;

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div>
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-2xl font-bold">Name Generator</h1>
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Generate grounded, non-repetitive names from the built-in pools. Nothing here is written anywhere until you pick a
                    name.
                </p>
            </div>

            <NameGeneratorFilters
                kind={kind}
                onKindChange={setKind}
                gender={gender}
                onGenderChange={setGender}
                region={region}
                onRegionChange={setRegion}
                availableRegions={availableRegions}
                era={era}
                onEraChange={setEra}
                count={count}
                onCountChange={setCount}
                maxLength={maxLength}
                onMaxLengthChange={setMaxLength}
                startsWith={startsWith}
                onStartsWithChange={setStartsWith}
                onGenerate={handleGenerate}
                generatePending={generateMutation.isPending}
                disabled={!storyId}
            />

            {recentBatches.map((batch, batchIndex) => (
                <Card key={batch.id}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{batchIndex === 0 ? "Results" : "Earlier results"}</CardTitle>
                            <span className="text-xs text-muted-foreground">{batch.label}</span>
                        </div>
                        {batch.result.excludedCount > 0 && (
                            <Badge variant="outline">{batch.result.excludedCount} excluded (already used or a character name)</Badge>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {batch.result.names.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No names matched those filters — try a broader region, era, or fewer light filters.
                            </p>
                        ) : (
                            batch.result.names.map((name, index) => (
                                <GeneratedNameRow
                                    key={`${name.poolId}-${name.name}-${index}`}
                                    result={name}
                                    nameType={batch.nameType}
                                    isUsed={isNameUsed(name.name, batch.nameType)}
                                    markUsedPending={markUsedMutation.isPending}
                                    onMarkUsed={() =>
                                        markUsedMutation.mutate({
                                            storyId,
                                            name: name.name,
                                            nameType: batch.nameType,
                                            source: "generated",
                                            poolNameId: undefined
                                        })
                                    }
                                    onCreateCodexEntry={() => handleCreateCodexEntry(name.name)}
                                    isFavorited={favoritesByKey.has(favoriteKey(name.name, batch.nameType))}
                                    favoritePending={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                                    onToggleFavorite={() => handleToggleFavorite(name.name, batch.nameType, name.poolId)}
                                />
                            ))
                        )}
                    </CardContent>
                </Card>
            ))}

            {favoritesData && favoritesData.favorites.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Favorites</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                            {favoritesData.favorites.map(favorite => (
                                <Badge key={favorite.id} variant="outline" className="capitalize gap-1 pr-1">
                                    {favorite.name}
                                    <span className="text-muted-foreground/70 lowercase">({favorite.nameType})</span>
                                    <button
                                        type="button"
                                        title="Remove favorite"
                                        className="ml-0.5 rounded-sm hover:bg-muted"
                                        onClick={() => removeFavoriteMutation.mutate({ storyId, id: favorite.id })}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {usedData && usedData.usedNames.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Used in this story</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                            {usedData.usedNames.map(used => (
                                <Badge key={used.id} variant="secondary" className="capitalize">
                                    {used.name}
                                    <span className="ml-1 text-muted-foreground/70 lowercase">({used.nameType})</span>
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <ImportPoolDialog open={importOpen} onOpenChange={setImportOpen} storyId={storyId} />
        </div>
    );
}
