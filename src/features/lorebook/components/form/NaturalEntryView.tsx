import { LayoutList } from "lucide-react";
import { useRef } from "react";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useNaturalEntryView } from "@/lib/useNaturalEntryView";
import type { CreateEntryForm } from "./entryFormUtils";
import { LorebookReworkButton } from "./LorebookReworkButton";
import { NaturalLabeledFields, NaturalStateSection } from "./NaturalStateFields";

interface NaturalEntryViewProps {
    control: Control<CreateEntryForm>;
    // Same purpose as RawEntryFields' props (P0.4 R4) — this view writes to the same description
    // RHF field, so it needs its own "Rework in chat" trigger too.
    entryId?: string;
    storyId?: string;
}

// Editable "character profile" presentation of the same form fields the raw-field view edits —
// prose under labeled sections instead of tag chips and boxed inputs, styled after a reference
// character sheet (see docs conversation 2026-07-17). Section order follows that reference
// document's own layout: Name, then Core Identity (Age/Role/etc — every character sheet has
// this, not an optional "custom" extra, hence the rename from the old "Custom Fields" label) +
// Appearance, then the narrative Description, then Wardrobe/Wounds/Items. Writes to the exact
// same react-hook-form control as the raw-field view, so switching the Advanced Settings toggle
// mid-edit never loses data and Save/Update stays untouched. Tags are intentionally not
// rendered here — that's the whole point of the toggle; switch back to the raw-field view to
// manage tags.
export function NaturalEntryView({ control, entryId, storyId }: NaturalEntryViewProps) {
    const codexEnabled = useWatch({ control, name: "codexEnabled" });
    const category = useWatch({ control, name: "category" });
    const [, setNaturalView] = useNaturalEntryView();
    const descriptionRef = useRef<HTMLTextAreaElement>(null);

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-2">
                <FormField
                    control={control}
                    name="name"
                    rules={{ required: "Name is required" }}
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormControl>
                                <Input
                                    {...field}
                                    placeholder="Name"
                                    className="h-auto border-0 border-b-2 rounded-none px-0 pb-2 text-3xl font-bold shadow-none focus-visible:ring-0 focus-visible:border-primary"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mt-1 shrink-0"
                    onClick={() => setNaturalView(false)}
                    title="Switch to Form View"
                >
                    <LayoutList className="h-4 w-4" />
                </Button>
            </div>

            {category === "character" && (
                <FormField
                    control={control}
                    name="codexEnabled"
                    render={({ field }) => (
                        <FormItem className="flex items-center justify-between space-x-2">
                            <span className="text-sm font-semibold text-muted-foreground">Track Character State</span>
                            <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )}
                />
            )}

            {category === "character" && codexEnabled && (
                <div className="space-y-2">
                    <NaturalLabeledFields
                        control={control}
                        name="codexState.customFields"
                        title="Core Identity"
                        labelPlaceholder="Label (e.g. Age)"
                        valuePlaceholder="Value (e.g. 19 Years Old)"
                        addButtonText="Add attribute"
                    />
                    <NaturalLabeledFields
                        control={control}
                        name="codexState.appearance"
                        title="Appearance"
                        labelPlaceholder="Label (e.g. Hair)"
                        valuePlaceholder="Value (e.g. jet-black asymmetrical bob)"
                        addButtonText="Add appearance detail"
                    />
                </div>
            )}

            <FormField
                control={control}
                name="description"
                rules={{ required: "Description is required" }}
                render={({ field }) => (
                    <FormItem>
                        <div className="flex justify-end">
                            <LorebookReworkButton entryId={entryId} storyId={storyId} textareaRef={descriptionRef} />
                        </div>
                        <FormControl>
                            <Textarea
                                {...field}
                                ref={el => {
                                    field.ref(el);
                                    descriptionRef.current = el;
                                }}
                                placeholder="Write a flowing description..."
                                rows={8}
                                className="min-h-[160px] resize-y border-0 px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {category === "character" && codexEnabled && (
                <div className="border-t pt-4 space-y-2">
                    <NaturalStateSection
                        control={control}
                        name="codexState.wardrobe"
                        label="Wardrobe"
                        placeholder="Add a wardrobe item..."
                    />
                    <NaturalStateSection
                        control={control}
                        name="codexState.wounds"
                        label="Wounds"
                        placeholder="Add a wound..."
                    />
                    <NaturalStateSection
                        control={control}
                        name="codexState.items"
                        label="Items"
                        placeholder="Add an item..."
                    />
                </div>
            )}
        </div>
    );
}
