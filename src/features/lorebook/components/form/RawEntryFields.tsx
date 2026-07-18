import { LayoutTemplate } from "lucide-react";
import type { Control } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNaturalEntryView } from "@/lib/useNaturalEntryView";
import { CATEGORIES, IMPORTANCE_LEVELS } from "./entryFormUtils";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";
import { CodexStateEditor } from "./CodexStateEditor";
import { SelectField } from "./SelectField";
import { TagsField } from "./TagsField";

interface RawEntryFieldsProps {
    control: Control<CreateEntryForm>;
    tagInput: string;
    selectedCategory: LorebookCategory;
}

// The original raw-field entry form (name/category/importance/tags/description/codex state) —
// extracted out of LorebookEntryEditor.tsx so it can sit alongside NaturalEntryView.tsx as the
// other half of the Advanced Settings "Natural View" toggle.
export function RawEntryFields({ control, tagInput, selectedCategory }: RawEntryFieldsProps) {
    const [, setNaturalView] = useNaturalEntryView();

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
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                            <Textarea {...field} rows={6} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {selectedCategory === "character" && <CodexStateEditor control={control} />}
        </>
    );
}
