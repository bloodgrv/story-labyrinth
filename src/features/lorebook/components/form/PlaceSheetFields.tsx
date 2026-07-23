import type { Control } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CreateEntryForm } from "./entryFormUtils";

interface PlaceSheetFieldsProps {
    control: Control<CreateEntryForm>;
}

// L1, docs/Locations_And_Maps_Design.md — light place sheet, only rendered for
// category="location" (see RawEntryFields.tsx's conditional). Plain controlled inputs bound
// straight into CreateEntryForm.placeState, submitted through buildSubmitData's metadata object
// like every other field here — no separate save action, and it survives a normal entry save now
// that buildSubmitData spreads the existing entry.metadata first (see its own doc comment). The
// WB chat's place-sheet-proposal fence (ChatInterface.tsx's handleAcceptPlaceSheet) writes into
// the same metadata.placeState directly, independent of this form.
export function PlaceSheetFields({ control }: PlaceSheetFieldsProps) {
    return (
        <div className="space-y-4 border rounded-md p-3">
            <p className="text-sm font-semibold">Place sheet</p>
            <p className="text-xs text-muted-foreground -mt-2">
                A lightweight structured summary — not tracked Codex state. Fill in whatever's known; the rest can come from a
                World-Building chat later.
            </p>

            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={control}
                    name="placeState.scale"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Scale</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="room / building / district / city / region…" />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="placeState.biomeOrClimate"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Biome / climate</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={control}
                    name="placeState.holder"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Holder</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="who controls this place" />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="placeState.dangerLevel"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Danger level</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            <FormField
                control={control}
                name="placeState.landmarks"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Landmarks</FormLabel>
                        <FormControl>
                            <Input
                                value={(field.value ?? []).join(", ")}
                                onChange={e =>
                                    field.onChange(
                                        e.target.value
                                            .split(",")
                                            .map(s => s.trim())
                                            .filter(Boolean)
                                    )
                                }
                                placeholder="comma-separated"
                            />
                        </FormControl>
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="placeState.exitsSummary"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Exits summary</FormLabel>
                        <FormControl>
                            <Textarea {...field} rows={2} placeholder="free text, until a Story Map graph exists for this place" />
                        </FormControl>
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="placeState.layoutMd"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Layout (markdown / ascii)</FormLabel>
                        <FormControl>
                            <Textarea {...field} rows={4} className="font-mono text-xs" />
                        </FormControl>
                    </FormItem>
                )}
            />

            <FormField
                control={control}
                name="placeState.imageBrief"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Image brief</FormLabel>
                        <FormControl>
                            <Textarea {...field} rows={2} placeholder="optional — used by the Map image preset, falls back to description" />
                        </FormControl>
                    </FormItem>
                )}
            />
        </div>
    );
}
