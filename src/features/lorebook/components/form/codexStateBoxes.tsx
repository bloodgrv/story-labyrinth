import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useState } from "react";
import { type Control, useFieldArray } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { cn } from "@/lib/utils";
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
                    onKeyDown={e => {
                        // Without this, Enter here fell through to the surrounding entry-editor
                        // <form>'s implicit submit instead of adding the field — silently saving
                        // the entry while the typed label/value sat unsubmitted in these two
                        // local-state inputs (see B2: this is why Core Identity/Appearance edits
                        // could appear to "vanish" — they were never actually part of a saved
                        // codexState to begin with).
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addField();
                        }
                    }}
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

interface SecretsBoxProps {
    control: Control<CreateEntryForm>;
    storyId?: string;
}

// Secrets (2026-08-14) — facts tracked here but excluded from AI-generated prose/context until
// revealed. Unlike the flat boxes above, each row carries its own reveal state: a manual toggle
// (always authoritative — see filterRevealedSecrets in chatContextService.ts) plus an optional
// "reveal at chapter" picker that auto-includes the secret once a chapter-aware AI surface
// (Editor chat, RAG Scanner) is generating for that chapter or later. The chapter field is purely
// a convenience — it never substitutes for flipping "Revealed" if the writer wants a secret
// visible everywhere immediately, and it does nothing at all in a non-chapter-anchored surface
// (WB chat, RAG search) where only the manual toggle is ever consulted.
export function SecretsBox({ control, storyId }: SecretsBoxProps) {
    const { fields, append, remove, update } = useFieldArray({ control, name: "codexState.secrets", keyName: "fieldId" });
    const [draft, setDraft] = useState("");
    const chaptersQuery = useChaptersByStoryQuery(storyId ?? "");
    const chapters = [...(chaptersQuery.data ?? [])].sort((a, b) => a.order - b.order);

    const addSecret = () => {
        if (!draft.trim()) return;
        append({ id: crypto.randomUUID(), value: draft.trim(), revealed: false, revealedAtChapterId: null });
        setDraft("");
    };

    return (
        <div className="border rounded-md p-3 space-y-2">
            <FormLabel>Secrets</FormLabel>
            <p className="text-xs text-muted-foreground">
                Never surfaced into AI-generated prose or chat context until revealed — flip "Revealed" yourself, or
                set "Reveal at chapter" so it's automatically visible once that chapter (or later) is being written.
            </p>
            {fields.length === 0 && <p className="text-xs text-muted-foreground">None yet</p>}
            {fields.map((field, index) => (
                <div key={field.fieldId} className="flex items-start gap-2 border rounded p-2">
                    <button
                        type="button"
                        onClick={() => update(index, { ...field, revealed: !field.revealed })}
                        title={field.revealed ? "Revealed — click to hide again" : "Hidden — click to reveal now"}
                        className={cn(
                            "mt-0.5 shrink-0 rounded p-1",
                            field.revealed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        )}
                    >
                        {field.revealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm break-words">{field.value}</p>
                        <div className="flex items-center gap-2">
                            <Badge variant={field.revealed ? "default" : "secondary"} className="text-[10px]">
                                {field.revealed ? "Revealed" : "Hidden"}
                            </Badge>
                            {storyId && (
                                <Select
                                    value={field.revealedAtChapterId ?? "__none__"}
                                    onValueChange={value => update(index, { ...field, revealedAtChapterId: value === "__none__" ? null : value })}
                                >
                                    <SelectTrigger className="h-6 text-xs w-44">
                                        <SelectValue placeholder="Reveal at chapter..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No auto-reveal chapter</SelectItem>
                                        {chapters.map(chapter => (
                                            <SelectItem key={chapter.id} value={chapter.id}>
                                                Ch. {chapter.order}: {chapter.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => remove(index)} title="Remove secret">
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ))}
            <div className="flex gap-2">
                <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Add a secret — e.g. 'Elizabeth Hartley is Lizbet Anderson's CIA cover identity'"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addSecret();
                        }
                    }}
                />
                <Button type="button" size="icon" variant="outline" onClick={addSecret} title="Add secret">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
