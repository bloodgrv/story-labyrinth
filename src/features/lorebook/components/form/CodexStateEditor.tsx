import { Plus, X } from "lucide-react";
import { useState } from "react";
import { type Control, useFieldArray, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CreateEntryForm } from "./entryFormUtils";

interface StateListBoxProps {
    control: Control<CreateEntryForm>;
    name: "codexState.wardrobe" | "codexState.appearance" | "codexState.wounds" | "codexState.items";
    label: string;
    placeholder: string;
}

// One boxed list of free-text items (wardrobe/appearance/wounds/items) — CodexStateItem's own
// `id` is kept as real submitted data, so useFieldArray is keyed on a different property
// (`fieldId`) to avoid react-hook-form silently overwriting our `id` with its own.
function StateListBox({ control, name, label, placeholder }: StateListBoxProps) {
    const { fields, append, remove } = useFieldArray({ control, name, keyName: "fieldId" });
    const [draft, setDraft] = useState("");

    const addItem = () => {
        if (!draft.trim()) return;
        append({ id: crypto.randomUUID(), value: draft.trim() });
        setDraft("");
    };

    return (
        <div className="border rounded-md p-3 space-y-2">
            <FormLabel>{label}</FormLabel>
            <div className="flex flex-wrap gap-2">
                {fields.length === 0 && <p className="text-xs text-muted-foreground">None yet</p>}
                {fields.map((field, index) => (
                    <Badge key={field.fieldId} variant="secondary" className="gap-1 pr-1 font-normal">
                        {field.value}
                        <button
                            type="button"
                            onClick={() => remove(index)}
                            className="rounded hover:bg-muted-foreground/20"
                            title={`Remove ${field.value}`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
            </div>
            <div className="flex gap-2">
                <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={placeholder}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addItem();
                        }
                    }}
                />
                <Button type="button" size="icon" variant="outline" onClick={addItem} title={`Add to ${label}`}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

const slugifyKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

// Custom key/label/value attributes — the "Core Identity" table (Age, Role, Aesthetic, etc.)
// in a reference character sheet maps onto this, one row per attribute.
function CustomFieldsBox({ control }: { control: Control<CreateEntryForm> }) {
    const { fields, append, remove } = useFieldArray({ control, name: "codexState.customFields" });
    const [label, setLabel] = useState("");
    const [value, setValue] = useState("");

    const addField = () => {
        if (!label.trim() || !value.trim()) return;
        append({ key: slugifyKey(label) || crypto.randomUUID(), label: label.trim(), value: value.trim() });
        setLabel("");
        setValue("");
    };

    return (
        <div className="border rounded-md p-3 space-y-2">
            <FormLabel>Custom Fields</FormLabel>
            {fields.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    E.g. Age, Role, Aesthetic — any attribute that doesn't fit the fields above.
                </p>
            )}
            {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                    <span className="text-sm font-medium w-28 shrink-0 truncate">{field.label}</span>
                    <span className="text-sm text-muted-foreground flex-1 truncate">{field.value}</span>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(index)}
                        title={`Remove ${field.label}`}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ))}
            <div className="flex gap-2">
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Age)" className="w-28" />
                <Input
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="Value (e.g. 19 Years Old)"
                    className="flex-1"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addField();
                        }
                    }}
                />
                <Button type="button" size="icon" variant="outline" onClick={addField} title="Add custom field">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

interface CodexStateEditorProps {
    control: Control<CreateEntryForm>;
}

// Concrete/physical character state — wardrobe, appearance, wounds, items, custom attributes —
// with full snapshot history server-side (codexApi.enable/recordState). Deliberately excludes
// personality/backstory-type content: CLAUDE.md scopes the Character Codex to concrete physical
// state only, so narrative content stays in the Description field above this.
export function CodexStateEditor({ control }: CodexStateEditorProps) {
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
                    <StateListBox
                        control={control}
                        name="codexState.wardrobe"
                        label="Wardrobe"
                        placeholder="Add a wardrobe item..."
                    />
                    <StateListBox
                        control={control}
                        name="codexState.appearance"
                        label="Appearance"
                        placeholder="Add an appearance detail..."
                    />
                    <StateListBox control={control} name="codexState.wounds" label="Wounds" placeholder="Add a wound..." />
                    <StateListBox control={control} name="codexState.items" label="Items" placeholder="Add an item..." />
                    <CustomFieldsBox control={control} />
                </div>
            )}
        </div>
    );
}
