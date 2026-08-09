import { useRef } from "react";
import { type Control, useWatch } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
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

// The "machine chrome" raw-field entry form (category/importance/tags/raw description/raw Codex
// state) — lives inside the Advanced collapsible (AdvancedSettings.tsx) now that the Lore Sheet
// (LoreSheetEditor.tsx, T5 FS1) is the default primary editing surface. Name moved out to the
// primary section (LorebookEntryEditor.tsx); OpenMapButton/PlaceOnTimelineButton moved out too —
// those are user-facing action buttons, not machine chrome, so they stay visible without opening
// Advanced. Structured description/Codex fields here stay hand-editable directly (unchanged from
// before this pass) — the Sync loop that would make them a pure derived projection is FS3+, not
// built yet.
export function RawEntryFields({ control, tagInput, selectedCategory, entryId, storyId }: RawEntryFieldsProps) {
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    // L4 — locations have two tiers: PlaceSheetFields (unversioned) until codexEnabled, then
    // PlaceCodexStateEditor (versioned) takes over. See PlaceCodexStateEditor.tsx's own comment.
    const codexEnabled = useWatch({ control, name: "codexEnabled" });

    return (
        <>
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
            {selectedCategory === "location" && !codexEnabled && <PlaceSheetFields control={control} />}
            {/* PlaceCodexStateEditor renders unconditionally for locations (mirrors CodexStateEditor's
                own always-rendered pattern for character) — its "Track Place State" switch is the
                only way to ever flip codexEnabled on, so it can't be gated behind codexEnabled itself. */}
            {selectedCategory === "location" && <PlaceCodexStateEditor control={control} />}
        </>
    );
}
