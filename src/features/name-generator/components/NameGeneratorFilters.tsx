import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GenerateKind, NamePoolGender } from "@/types/nameGenerator";

// Split out of NameGeneratorPanel.tsx once NG7's favorites/defaults/recent-batches logic pushed
// that file over the max-lines limit — same reasoning as client.ts's own file splits.
export const ERA_BUCKETS: { value: string; label: string }[] = [
    { value: "1980-1999", label: "1980s-1990s" },
    { value: "2000-2019", label: "2000s-2010s" },
    // Open-ended "present" pools have eraEnd: null in the DB, which always matches on that side
    // regardless of the query's upper bound (see nameGeneratorRepository.ts's era-overlap
    // filter) — 2099 is just a safely-far value, not a real cutoff.
    { value: "2020-2099", label: "2020s-present" }
];

interface NameGeneratorFiltersProps {
    kind: GenerateKind;
    onKindChange: (kind: GenerateKind) => void;
    gender: NamePoolGender | "any";
    onGenderChange: (gender: NamePoolGender | "any") => void;
    region: string;
    onRegionChange: (region: string) => void;
    availableRegions: string[];
    era: string;
    onEraChange: (era: string) => void;
    count: number;
    onCountChange: (count: number) => void;
    maxLength: string;
    onMaxLengthChange: (value: string) => void;
    startsWith: string;
    onStartsWithChange: (value: string) => void;
    onGenerate: () => void;
    generatePending: boolean;
    disabled: boolean;
}

export function NameGeneratorFilters({
    kind,
    onKindChange,
    gender,
    onGenderChange,
    region,
    onRegionChange,
    availableRegions,
    era,
    onEraChange,
    count,
    onCountChange,
    maxLength,
    onMaxLengthChange,
    startsWith,
    onStartsWithChange,
    onGenerate,
    generatePending,
    disabled
}: NameGeneratorFiltersProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Tabs value={kind} onValueChange={value => onKindChange(value as GenerateKind)}>
                    <TabsList>
                        <TabsTrigger value="first_name">First name</TabsTrigger>
                        <TabsTrigger value="surname">Surname</TabsTrigger>
                        <TabsTrigger value="full_name">Full name</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(kind === "first_name" || kind === "full_name") && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Gender</Label>
                            <Select value={gender} onValueChange={value => onGenderChange(value as NamePoolGender | "any")}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="unisex">Unisex</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Region</Label>
                        <Select value={region} onValueChange={onRegionChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                {availableRegions.map(r => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {(kind === "first_name" || kind === "full_name") && (
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Era</Label>
                            <Select value={era} onValueChange={onEraChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any</SelectItem>
                                    {ERA_BUCKETS.map(bucket => (
                                        <SelectItem key={bucket.value} value={bucket.value}>
                                            {bucket.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Count</Label>
                        <Input
                            type="number"
                            min={1}
                            max={20}
                            value={count}
                            onChange={e => onCountChange(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Starts with (optional)</Label>
                        <Input value={startsWith} onChange={e => onStartsWithChange(e.target.value)} placeholder="e.g. Al" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Max length (optional)</Label>
                        <Input type="number" min={1} value={maxLength} onChange={e => onMaxLengthChange(e.target.value)} placeholder="e.g. 6" />
                    </div>
                </div>

                <Button onClick={onGenerate} disabled={generatePending || disabled}>
                    {generatePending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Generate
                </Button>
            </CardContent>
        </Card>
    );
}
