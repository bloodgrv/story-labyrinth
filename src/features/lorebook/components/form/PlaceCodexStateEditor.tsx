import { type Control, useFieldArray, useWatch } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { placeStateToCodexFields } from "../../utils/placeCodexMapping";
import type { CreateEntryForm } from "./entryFormUtils";
import { LabeledFieldsBox, StateListBox } from "./codexStateBoxes";

interface PlaceCodexStateEditorProps {
    control: Control<CreateEntryForm>;
}

// L4, docs/Locations_And_Maps_Design.md — location-flavored sibling of CodexStateEditor.tsx,
// reusing its LabeledFieldsBox/StateListBox primitives (extracted into codexStateBoxes.tsx so
// both editors can share them) but with location-appropriate labels instead of
// Wardrobe/Appearance/Wounds. No CodexState schema change: "Place Details" writes into the same
// generic codexState.customFields label/value array Character's "Core Identity" box uses;
// "Landmarks" writes into codexState.items (a plain string list, same underlying JSON key, just
// relabeled here — the field is generic, only Character's UI ever called it "Items").
//
// Two-tier model: RawEntryFields.tsx shows PlaceSheetFields.tsx (L1, unversioned
// metadata.placeState) until codexEnabled flips on, then swaps to this editor. On first toggle-on,
// prefillFromPlaceState below one-time-seeds codexState.customFields/items from whatever's
// currently in the form's placeState field (captures any unsaved L1 edits too, not just the
// entry's last-saved value) — guarded so re-toggling never clobbers existing Codex data.
export function PlaceCodexStateEditor({ control }: PlaceCodexStateEditorProps) {
    const codexEnabled = useWatch({ control, name: "codexEnabled" });
    const placeState = useWatch({ control, name: "placeState" });
    const customFields = useFieldArray({ control, name: "codexState.customFields" });
    const items = useFieldArray({ control, name: "codexState.items" });

    const handleToggle = (checked: boolean, onChange: (value: boolean) => void) => {
        onChange(checked);
        if (!checked) return;
        if (customFields.fields.length > 0 || items.fields.length > 0) return; // already has Codex data — never clobber

        const seeded = placeStateToCodexFields(placeState);
        for (const field of seeded.customFields) customFields.append(field);
        for (const item of seeded.items) items.append(item);
    };

    return (
        <div className="border rounded-md p-3 space-y-3">
            <FormField
                control={control}
                name="codexEnabled"
                render={({ field }) => (
                    <FormItem className="flex items-center justify-between space-x-2">
                        <div>
                            <FormLabel className="!mt-0">Track Place State</FormLabel>
                            <p className="text-xs text-muted-foreground">
                                Structured place details and landmarks, with full edit history — promotes this location's place sheet
                                into the versioned Codex system.
                            </p>
                        </div>
                        <FormControl>
                            <Switch checked={field.value} onCheckedChange={checked => handleToggle(checked, field.onChange)} />
                        </FormControl>
                    </FormItem>
                )}
            />

            {codexEnabled && (
                <div className="space-y-3 pt-1">
                    <LabeledFieldsBox
                        control={control}
                        name="codexState.customFields"
                        title="Place Details"
                        emptyHint="E.g. Scale, Holder, Danger Level — the location's core structured facts."
                        labelPlaceholder="Label (e.g. Scale)"
                        valuePlaceholder="Value (e.g. City)"
                    />
                    <StateListBox control={control} name="codexState.items" label="Landmarks" placeholder="Add a landmark..." />
                </div>
            )}
        </div>
    );
}
