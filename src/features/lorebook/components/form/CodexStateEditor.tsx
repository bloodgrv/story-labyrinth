import { type Control, useWatch } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import type { CreateEntryForm } from "./entryFormUtils";
import { LabeledFieldsBox, SecretsBox, StateListBox } from "./codexStateBoxes";

interface CodexStateEditorProps {
    control: Control<CreateEntryForm>;
    storyId?: string;
}

// Concrete/physical character state — wardrobe, appearance, wounds, items, custom attributes —
// with full snapshot history server-side (codexApi.enable/recordState). Deliberately excludes
// personality/backstory-type content: CLAUDE.md scopes the Character Codex to concrete physical
// state only, so narrative content stays in the Description field above this.
//
// LabeledFieldsBox/StateListBox extracted into codexStateBoxes.tsx (L4) so
// PlaceCodexStateEditor.tsx can reuse them with location-flavored labels — no logic here is
// character-specific beyond which fields/titles get passed in.
export function CodexStateEditor({ control, storyId }: CodexStateEditorProps) {
    const codexEnabled = useWatch({ control, name: "codexEnabled" });

    return (
        <div className="border rounded-md p-3 space-y-3">
            <FormField
                control={control}
                name="codexEnabled"
                render={({ field }) => (
                    <FormItem className="flex items-center justify-between space-x-2">
                        <div>
                            <FormLabel className="!mt-0">Track Character State</FormLabel>
                            <p className="text-xs text-muted-foreground">
                                Concrete physical state — wardrobe, appearance, wounds, items — with full edit history.
                            </p>
                        </div>
                        <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                    </FormItem>
                )}
            />

            {codexEnabled && (
                <div className="space-y-3 pt-1">
                    <LabeledFieldsBox
                        control={control}
                        name="codexState.customFields"
                        title="Core Identity"
                        emptyHint="E.g. Age, Role, Occupation — every character has these, not just optional extras."
                        labelPlaceholder="Label (e.g. Age)"
                        valuePlaceholder="Value (e.g. 19 Years Old)"
                    />
                    <LabeledFieldsBox
                        control={control}
                        name="codexState.appearance"
                        title="Appearance"
                        emptyHint="E.g. Hair, Facial Features, Physique — one labeled physical attribute per row."
                        labelPlaceholder="Label (e.g. Hair)"
                        valuePlaceholder="Value (e.g. jet-black asymmetrical bob)"
                    />
                    <StateListBox
                        control={control}
                        name="codexState.wardrobe"
                        label="Wardrobe"
                        placeholder="Add a wardrobe item..."
                    />
                    <StateListBox control={control} name="codexState.wounds" label="Wounds" placeholder="Add a wound..." />
                    <StateListBox control={control} name="codexState.items" label="Items" placeholder="Add an item..." />
                    <SecretsBox control={control} storyId={storyId} />
                </div>
            )}
        </div>
    );
}
