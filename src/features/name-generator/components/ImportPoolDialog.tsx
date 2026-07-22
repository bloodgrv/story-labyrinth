import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImportLevel, NamePoolGender, NamePoolKind } from "@/types/nameGenerator";
import { useImportCsvMutation, useImportJsonMutation } from "../hooks/useNameGeneratorQuery";

interface ImportPoolDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storyId: string;
}

// NG5 — JSON pack (one or more complete pool definitions) or CSV (a plain name/tier list,
// needing pool metadata supplied here since the file itself doesn't carry it). Both formats
// support global or story-scoped import (locked decision #7); series scope isn't offered, same
// as the generate panel's own filters.
export function ImportPoolDialog({ open, onOpenChange, storyId }: ImportPoolDialogProps) {
    const [format, setFormat] = useState<"json" | "csv">("json");
    const [level, setLevel] = useState<ImportLevel>("story");
    const [poolName, setPoolName] = useState("");
    const [kind, setKind] = useState<NamePoolKind>("first_name");
    const [gender, setGender] = useState<NamePoolGender | "none">("none");
    const [region, setRegion] = useState("");
    const [eraStart, setEraStart] = useState("");
    const [eraEnd, setEraEnd] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const importJsonMutation = useImportJsonMutation();
    const importCsvMutation = useImportCsvMutation();
    const isPending = importJsonMutation.isPending || importCsvMutation.isPending;

    const reset = () => {
        setPoolName("");
        setRegion("");
        setEraStart("");
        setEraEnd("");
        setGender("none");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            toast.error("Choose a file first");
            return;
        }
        const scope = { level, storyId: level === "story" ? storyId : undefined };

        if (format === "json") {
            importJsonMutation.mutate({ file, scope }, { onSuccess: () => { reset(); onOpenChange(false); } });
            return;
        }

        if (!poolName.trim() || !region.trim()) {
            toast.error("Pool name and region are required for CSV import");
            return;
        }
        importCsvMutation.mutate(
            {
                file,
                scope,
                meta: {
                    poolName: poolName.trim(),
                    kind,
                    gender: gender === "none" ? undefined : gender,
                    region: region.trim(),
                    eraStart: eraStart ? Number(eraStart) : undefined,
                    eraEnd: eraEnd ? Number(eraEnd) : undefined
                }
            },
            { onSuccess: () => { reset(); onOpenChange(false); } }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import name pool</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Tabs value={format} onValueChange={value => setFormat(value as "json" | "csv")}>
                        <TabsList>
                            <TabsTrigger value="json">JSON pack</TabsTrigger>
                            <TabsTrigger value="csv">CSV</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            {format === "json" ? "JSON file (one pool, or an array of pools)" : "CSV file (name, tier columns)"}
                        </Label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={format === "json" ? ".json,application/json" : ".csv,text/csv"}
                            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Scope</Label>
                        <Select value={level} onValueChange={value => setLevel(value as ImportLevel)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="story">This story only</SelectItem>
                                <SelectItem value="global">Global (every story)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {format === "csv" && (
                        <div className="space-y-3 rounded-md border p-3">
                            <p className="text-xs text-muted-foreground">
                                CSV files only carry names — pool metadata for the whole file goes here.
                            </p>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Pool name</Label>
                                <Input value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="e.g. My Fantasy Elves" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Kind</Label>
                                    <Select value={kind} onValueChange={value => setKind(value as NamePoolKind)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="first_name">First name</SelectItem>
                                            <SelectItem value="surname">Surname</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Region</Label>
                                    <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Elvish" />
                                </div>
                            </div>
                            {kind === "first_name" && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Gender (optional)</Label>
                                    <Select value={gender} onValueChange={value => setGender(value as NamePoolGender | "none")}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Unspecified</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="unisex">Unisex</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Era start (optional)</Label>
                                    <Input type="number" value={eraStart} onChange={e => setEraStart(e.target.value)} placeholder="e.g. 1980" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Era end (optional)</Label>
                                    <Input type="number" value={eraEnd} onChange={e => setEraEnd(e.target.value)} placeholder="blank = present" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
