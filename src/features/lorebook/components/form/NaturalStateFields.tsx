import { Plus, X } from "lucide-react";
import { useState } from "react";
import { type Control, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import type { CreateEntryForm } from "./entryFormUtils";

interface NaturalStateSectionProps {
    control: Control<CreateEntryForm>;
    name: "codexState.wardrobe" | "codexState.wounds" | "codexState.items";
    label: string;
    placeholder: string;
}

// Same underlying useFieldArray list as CodexStateEditor's StateListBox — just laid out as a
// labeled flowing line ("Wardrobe: item, item, item") instead of a boxed pill list, to match a
// prose character-sheet reading style.
export function NaturalStateSection({ control, name, label, placeholder }: NaturalStateSectionProps) {
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

interface NaturalLabeledFieldsProps {
    control: Control<CreateEntryForm>;
    name: "codexState.appearance" | "codexState.customFields";
    title?: string;
    labelPlaceholder: string;
    valuePlaceholder: string;
    addButtonText: string;
}

// Same underlying useFieldArray list as CodexStateEditor's LabeledFieldsBox, laid out as
// "Label: Value" lines — the "Core Identity" table row style from a reference character sheet.
// Shared by Appearance (Hair/Facial Features/Physique/etc) and Core Identity (Age/Role/etc) —
// same CodexCustomField shape either way.
export function NaturalLabeledFields({
    control,
    name,
    title,
    labelPlaceholder,
    valuePlaceholder,
    addButtonText
}: NaturalLabeledFieldsProps) {
    const { fields, append, remove } = useFieldArray({ control, name });
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
            {title && <p className="text-sm font-semibold text-muted-foreground">{title}</p>}
            {fields.map((field, index) => (
                <p key={field.id} className="group leading-relaxed">
                    {field.label && <span className="font-semibold">{field.label}: </span>}
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
                        placeholder={labelPlaceholder}
                        className="h-7 w-32"
                    />
                    <Input
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        placeholder={valuePlaceholder}
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
                    <Plus className="h-3.5 w-3.5" /> {addButtonText}
                </button>
            )}
        </div>
    );
}
