import { Plus, X } from "lucide-react";
import { useState } from "react";
import { type Control, useFieldArray } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { CreateEntryForm } from "./entryFormUtils";

// Shared codexState field-array primitives — extracted out of CodexStateEditor.tsx (L4,
// docs/Locations_And_Maps_Design.md) so PlaceCodexStateEditor.tsx can reuse them with
// location-flavored labels/titles. No character-specific logic lives in either box — only the
// prop values passed by each caller differ.

interface StateListBoxProps {
    control: Control<CreateEntryForm>;
    name: "codexState.wardrobe" | "codexState.wounds" | "codexState.items";
    label: string;
    placeholder: string;
}

// One boxed list of free-text items (wardrobe/appearance/wounds/items) — CodexStateItem's own
// `id` is kept as real submitted data, so useFieldArray is keyed on a different property
// (`fieldId`) to avoid react-hook-form silently overwriting our `id` with its own.
export function StateListBox({ control, name, label, placeholder }: StateListBoxProps) {
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

interface LabeledFieldsBoxProps {
    control: Control<CreateEntryForm>;
    name: "codexState.appearance" | "codexState.customFields";
    title: string;
    emptyHint: string;
    labelPlaceholder: string;
    valuePlaceholder: string;
}

// Labeled key/value attributes — shared by Character's Appearance/Core Identity boxes and
// Location's Place Details box. Same CodexCustomField shape either way.
export function LabeledFieldsBox({ control, name, title, emptyHint, labelPlaceholder, valuePlaceholder }: LabeledFieldsBoxProps) {
    const { fields, append, remove } = useFieldArray({ control, name });
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
            <FormLabel>{title}</FormLabel>
            {fields.length === 0 && <p className="text-xs text-muted-foreground">{emptyHint}</p>}
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
                <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder={labelPlaceholder}
                    className="w-28"
                />
                <Input
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={valuePlaceholder}
                    className="flex-1"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addField();
                        }
                    }}
                />
                <Button type="button" size="icon" variant="outline" onClick={addField} title={`Add to ${title}`}>
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
