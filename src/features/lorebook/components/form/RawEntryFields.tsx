import { LayoutTemplate } from "lucide-react";
import { useRef } from "react";
import { type Control, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OpenMapButton } from "@/features/story-maps/components/OpenMapButton";
import { useNaturalEntryView } from "@/lib/useNaturalEntryView";
import { CATEGORIES, IMPORTANCE_LEVELS } from "./entryFormUtils";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";
import { CodexStateEditor } from "./CodexStateEditor";
import { LorebookReworkButton } from "./LorebookReworkButton";
import { PlaceCodexStateEditor } from "./PlaceCodexStateEditor";
import { PlaceSheetFields } from "./PlaceSheetFields";
import { SelectField } from "./SelectField";
import { TagsField } from "./TagsField";

interface RawEntryFieldsProps {
    control: Control<CreateEntryForm>;
    tagInput: string;
    selectedCategory: LorebookCategory;
    // Needed only for the description field's "Rework in chat" trigger (P0.4 R4) — anchors the
    // rework to this entry's World-Building chat. Undefined for a brand-new unsaved entry, which
    // just disables the button (see LorebookReworkButton.tsx).
    entryId?: string;
    storyId?: string;
}

// The original raw-field entry form (name/category/importance/tags/description/codex state) —
// extracted out of LorebookEntryEditor.tsx so it can sit alongside NaturalEntryView.tsx as the
// other half of the Advanced Settings "Natural View" toggle.
export function RawEntryFields({ control, tagInput, selectedCategory, entryId, storyId }: RawEntryFieldsProps) {
    const [, setNaturalView] = useNaturalEntryView();
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    // L4 — locations have two tiers: PlaceSheetFields (unversioned) until codexEnabled, then
    // PlaceCodexStateEditor (versioned) takes over. See PlaceCodexStateEditor.tsx's own comment.
    const codexEnabled = useWatch({ control, name: "codexEnabled" });
    const name = useWatch({ control, name: "name" });

    return (
        <>
            <div className="flex items-start gap-2">
                <FormField
                    control={control}
                    name="name"
                    rules={{ required: "Name is required" }}
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="mt-6 shrink-0"
                    onClick={() => setNaturalView(true)}
                    title="Switch to Natural View"
                >
                    <LayoutTemplate className="h-4 w-4" />
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <SelectField control={control} name="category" label="Category" options={CATEGORIES} placeholder="Select category" />
                <SelectField
                    control={control}
                    name="importance"
                    label="Importance"
                    options={IMPORTANCE_LEVELS}
                    placeholder="Select importance"
                />
            </div>

            <TagsField control={control} tagInput={tagInput} />

            <FormField
                control={control}
                name="description"
                rules={{ required: "Description is required" }}
                render={({ field }) => (
                    <FormItem>
                        <div className="flex items-center justify-between">
                            <FormLabel>Description</FormLabel>
                            <LorebookReworkButton entryId={entryId} storyId={storyId} textareaRef={descriptionRef} />
                        </div>
                        <FormControl>
                            <Textarea
                                {...field}
                                ref={el => {
                                    field.ref(el);
                                    descriptionRef.current = el;
                                }}
                                rows={6}
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {selectedCategory === "character" && <CodexStateEditor control={control} />}
            {/* MV3, docs/Maps_V2_Sketch_Design.md — "from location Open map" create flow. Orthogonal
                to codexEnabled/L4 place-Codex versioning (a map link isn't Codex state), so it's not
                gated behind !codexEnabled the way PlaceSheetFields below is. Needs a saved entryId
                (a brand-new unsaved entry can't be a map's locationId yet, same guard
                LorebookReworkButton uses for its own entryId-gated affordance) and storyId. */}
            {selectedCategory === "location" && entryId && storyId && (
                <OpenMapButton storyId={storyId} locationId={entryId} locationName={name || "Untitled location"} />
            )}
            {selectedCategory === "location" && !codexEnabled && <PlaceSheetFields control={control} />}
            {/* PlaceCodexStateEditor renders unconditionally for locations (mirrors CodexStateEditor's
                own always-rendered pattern for character) — its "Track Place State" switch is the
                only way to ever flip codexEnabled on, so it can't be gated behind codexEnabled itself. */}
            {selectedCategory === "location" && <PlaceCodexStateEditor control={control} />}
        </>
    );
}
