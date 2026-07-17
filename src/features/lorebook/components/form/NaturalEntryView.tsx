import { Plus, X } from "lucide-react";
import { useState } from "react";
import { type Control, useFieldArray, useWatch } from "react-hook-form";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CreateEntryForm } from "./entryFormUtils";

interface NaturalStateSectionProps {
    control: Control<CreateEntryForm>;
    name: "codexState.wardrobe" | "codexState.appearance" | "codexState.wounds" | "codexState.items";
    label: string;
    placeholder: string;
}

// Same underlying useFieldArray list as CodexStateEditor's StateListBox — just laid out as a
// labeled flowing line ("Wardrobe: item, item, item") instead of a boxed pill list, to match a
// prose character-sheet reading style.
function NaturalStateSection({ control, name, label, placeholder }: NaturalStateSectionProps) {
    const { fields, append, remove } = useFieldArray({ control, name, keyName: "fieldId" });
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");

    const addItem = () => {
        if (!draft.trim()) return;
        append({ id: crypto.randomUUID(), value: draft.trim() });
        setDraft("");
        setAdding(false);
    };

    return (
        <p className="leading-relaxed">
            <span className="font-semibold">{label}: </span>
            {fields.length === 0 && !adding && <span className="text-muted-foreground italic">None yet</span>}
            {fields.map((field, index) => (
                <span key={field.fieldId} className="group inline-flex items-center gap-0.5">
                    {index > 0 && ", "}
                    {field.value}
                    <button
                        type="button"
                        onClick={() => remove(index)}
                        className="ml-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        title={`Remove ${field.value}`}
                    >
                        <X className="h-3 w-3 inline" />
                    </button>
                </span>
            ))}
            {adding ? (
                <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => (draft.trim() ? addItem() : setAdding(false))}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addItem();
                        }
                        if (e.key === "Escape") setAdding(false);
                    }}
                    placeholder={placeholder}
                    className="inline-flex h-6 w-40 px-1 py-0 align-middle"
                />
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="ml-1 text-muted-foreground hover:text-foreground align-middle"
                    title={`Add to ${label}`}
                >
                    <Plus className="h-3.5 w-3.5 inline" />
                </button>
            )}
        </p>
    );
}

// Same underlying useFieldArray list as CodexStateEditor's CustomFieldsBox, laid out as
// "Label: Value" lines — the "Core Identity" table row style from a reference character sheet.
function NaturalCustomFields({ control }: { control: Control<CreateEntryForm> }) {
    const { fields, append, remove } = useFieldArray({ control, name: "codexState.customFields" });
    const [adding, setAdding] = useState(false);
    const [label, setLabel] = useState("");
    const [value, setValue] = useState("");

    const slugifyKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    const addField = () => {
        if (!label.trim() || !value.trim()) return;
        append({ key: slugifyKey(label) || crypto.randomUUID(), label: label.trim(), value: value.trim() });
        setLabel("");
        setValue("");
        setAdding(false);
    };

    return (
        <div className="space-y-1">
            {fields.map((field, index) => (
                <p key={field.id} className="group leading-relaxed">
                    <span className="font-semibold">{field.label}: </span>
                    {field.value}
                    <button
                        type="button"
                        onClick={() => remove(index)}
                        className="ml-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive align-middle"
                        title={`Remove ${field.label}`}
                    >
                        <X className="h-3 w-3 inline" />
                    </button>
                </p>
            ))}
            {adding ? (
                <div className="flex items-center gap-2">
                    <Input
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="Label (e.g. Age)"
                        className="h-7 w-32"
                    />
                    <Input
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        placeholder="Value (e.g. 19 Years Old)"
                        className="h-7 flex-1"
                        onKeyDown={e => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addField();
                            }
                            if (e.key === "Escape") setAdding(false);
                        }}
                        onBlur={() => (label.trim() && value.trim() ? addField() : setAdding(false))}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5" /> Add attribute
                </button>
            )}
        </div>
    );
}

interface NaturalEntryViewProps {
    control: Control<CreateEntryForm>;
}

// Editable "character profile" presentation of the same form fields the raw-field view edits —
// prose under labeled sections instead of tag chips and boxed inputs, styled after a reference
// character sheet (see docs conversation 2026-07-17). Writes to the exact same react-hook-form
// control as the raw-field view, so switching the Advanced Settings toggle mid-edit never loses
// data and Save/Update stays untouched. Tags are intentionally not rendered here — that's the
// whole point of the toggle; switch back to the raw-field view to manage tags.
export function NaturalEntryView({ control }: NaturalEntryViewProps) {
    const codexEnabled = useWatch({ control, name: "codexEnabled" });
    const category = useWatch({ control, name: "category" });

    return (
        <div className="space-y-5">
            <FormField
                control={control}
                name="name"
                rules={{ required: "Name is required" }}
                render={({ field }) => (
                    <FormItem>
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

            <FormField
                control={control}
                name="description"
                rules={{ required: "Description is required" }}
                render={({ field }) => (
                    <FormItem>
                        <FormControl>
                            <Textarea
                                {...field}
                                placeholder="Write a flowing description..."
                                rows={8}
                                className="min-h-[160px] resize-y border-0 px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
                            />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            {category === "character" && (
                <div className="border-t pt-4 space-y-2">
                    <FormField
                        control={control}
                        name="codexEnabled"
                        render={({ field }) => (
                            <FormItem className="flex items-center justify-between space-x-2">
                                <span className="text-sm font-semibold text-muted-foreground">Physical & Concrete State</span>
                                <FormControl>
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    {codexEnabled && (
                        <div className="space-y-2 pt-1">
                            <NaturalStateSection
                                control={control}
                                name="codexState.wardrobe"
                                label="Wardrobe"
                                placeholder="Add a wardrobe item..."
                            />
                            <NaturalStateSection
                                control={control}
                                name="codexState.appearance"
                                label="Appearance"
                                placeholder="Add an appearance detail..."
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
                            <NaturalCustomFields control={control} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
