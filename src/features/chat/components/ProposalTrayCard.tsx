import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    useApproveProposalMutation,
    useRejectProposalMutation,
    useReviseProposalMutation
} from "@/features/chat/hooks/useCodexProposalsQuery";
import type { CodexCustomField, CodexPendingChange, CodexState, CodexStateItem } from "@/types/codex";

interface ProposalTrayCardProps {
    proposal: CodexPendingChange;
    chatId: string;
    entryName: string;
    entryCategory: string;
}

const EMPTY_CODEX_STATE: CodexState = { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [] };

// One boxed list of free-text items (wardrobe/wounds/items) — same visual pattern as
// src/features/lorebook/components/form/codexStateBoxes.tsx's StateListBox, but local-state-only
// (this card isn't inside a react-hook-form, unlike the entry editor).
function ItemListBox({
    label,
    items,
    onChange
}: {
    label: string;
    items: CodexStateItem[];
    onChange: (items: CodexStateItem[]) => void;
}) {
    const [draft, setDraft] = useState("");

    const addItem = () => {
        if (!draft.trim()) return;
        onChange([...items, { id: crypto.randomUUID(), value: draft.trim() }]);
        setDraft("");
    };

    return (
        <div className="border rounded-md p-2 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <div className="flex flex-wrap gap-1.5">
                {items.length === 0 && <p className="text-xs text-muted-foreground">None yet</p>}
                {items.map((item, index) => (
                    <Badge key={item.id} variant="secondary" className="gap-1 pr-1 font-normal">
                        {item.value}
                        <button
                            type="button"
                            onClick={() => onChange(items.filter((_, i) => i !== index))}
                            className="rounded hover:bg-muted-foreground/20"
                            title={`Remove ${item.value}`}
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
                    placeholder={`Add to ${label.toLowerCase()}`}
                    className="h-8 text-sm"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addItem();
                        }
                    }}
                />
                <Button type="button" size="icon" className="h-8 w-8" variant="outline" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

// Labeled key/value list (appearance/customFields) — same local-state posture as ItemListBox above.
function LabeledFieldListBox({
    label,
    fields,
    onChange
}: {
    label: string;
    fields: CodexCustomField[];
    onChange: (fields: CodexCustomField[]) => void;
}) {
    const [draftLabel, setDraftLabel] = useState("");
    const [draftValue, setDraftValue] = useState("");

    const addField = () => {
        if (!draftLabel.trim() || !draftValue.trim()) return;
        onChange([...fields, { key: crypto.randomUUID(), label: draftLabel.trim(), value: draftValue.trim() }]);
        setDraftLabel("");
        setDraftValue("");
    };

    return (
        <div className="border rounded-md p-2 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {fields.length === 0 && <p className="text-xs text-muted-foreground">None yet</p>}
            {fields.map((field, index) => (
                <div key={field.key} className="flex items-center gap-2">
                    <span className="text-sm font-medium w-24 shrink-0 truncate">{field.label}</span>
                    <span className="text-sm text-muted-foreground flex-1 truncate">{field.value}</span>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => onChange(fields.filter((_, i) => i !== index))}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ))}
            <div className="flex gap-2">
                <Input
                    value={draftLabel}
                    onChange={e => setDraftLabel(e.target.value)}
                    placeholder="Label"
                    className="h-8 w-24 text-sm"
                />
                <Input
                    value={draftValue}
                    onChange={e => setDraftValue(e.target.value)}
                    placeholder="Value"
                    className="h-8 flex-1 text-sm"
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addField();
                        }
                    }}
                />
                <Button type="button" size="icon" className="h-8 w-8" variant="outline" onClick={addField}>
                    <Plus className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

// Read-only summary of a proposal's proposedState — shown outside edit mode so structured field
// changes are actually visible before approval, not applied silently (previously the tray only
// ever rendered proposedDescription/proposedTags, see DECISIONS.md).
function ProposedStateSummary({ state: rawState }: { state: CodexState }) {
    // rawState may only include the section(s) actually changing (see
    // CODEX_PROPOSAL_INSTRUCTIONS) — normalize before reading any key's length.
    const state = { ...EMPTY_CODEX_STATE, ...rawState };
    const sections: Array<[string, string]> = [];
    if (state.wardrobe.length) sections.push(["Wardrobe", state.wardrobe.map(i => i.value).join(", ")]);
    if (state.appearance.length) sections.push(["Appearance", state.appearance.map(f => `${f.label}: ${f.value}`).join(", ")]);
    if (state.wounds.length) sections.push(["Wounds", state.wounds.map(i => i.value).join(", ")]);
    if (state.items.length) sections.push(["Items", state.items.map(i => i.value).join(", ")]);
    if (state.customFields.length) sections.push(["Custom fields", state.customFields.map(f => `${f.label}: ${f.value}`).join(", ")]);
    if (sections.length === 0) return null;

    return (
        <div className="space-y-1 border rounded-md p-2">
            {sections.map(([label, value]) => (
                <div key={label} className="text-sm">
                    <span className="font-medium">{label}:</span> <span className="text-muted-foreground">{value}</span>
                </div>
            ))}
        </div>
    );
}

function ProposedStateEditor({ state, onChange }: { state: CodexState; onChange: (state: CodexState) => void }) {
    return (
        <div className="space-y-2">
            <ItemListBox label="Wardrobe" items={state.wardrobe} onChange={wardrobe => onChange({ ...state, wardrobe })} />
            <LabeledFieldListBox label="Appearance" fields={state.appearance} onChange={appearance => onChange({ ...state, appearance })} />
            <ItemListBox label="Wounds" items={state.wounds} onChange={wounds => onChange({ ...state, wounds })} />
            <ItemListBox label="Items" items={state.items} onChange={items => onChange({ ...state, items })} />
            <LabeledFieldListBox
                label="Custom fields"
                fields={state.customFields}
                onChange={customFields => onChange({ ...state, customFields })}
            />
        </div>
    );
}

// Per-item card for CodexProposalTray.tsx — same Approve/Reject as the inline ProposalCard.tsx
// this tray replaces for Editor chats, plus a new Edit action wiring the already-implemented,
// previously-unused useReviseProposalMutation (server-side reviseChatProposal has existed since
// before this tray — only the UI to reach it was missing). Action-row/status-badge pattern
// modeled on src/features/rag-scanner/components/IssueCard.tsx.
export function ProposalTrayCard({ proposal, chatId, entryName, entryCategory }: ProposalTrayCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftDescription, setDraftDescription] = useState(proposal.proposedDescription ?? "");
    const [draftTags, setDraftTags] = useState((proposal.proposedTags ?? []).join(", "));
    // proposedState from a model-emitted proposal may only include the section(s) actually
    // changing (see CODEX_PROPOSAL_INSTRUCTIONS) — normalize to all 5 keys so the sub-editors
    // below never see an undefined array.
    const [draftState, setDraftState] = useState<CodexState>({ ...EMPTY_CODEX_STATE, ...proposal.proposedState });

    const approveMutation = useApproveProposalMutation(chatId);
    const rejectMutation = useRejectProposalMutation(chatId);
    const reviseMutation = useReviseProposalMutation(chatId);

    const isPending = proposal.status === "pending";
    const isUpdating = approveMutation.isPending || rejectMutation.isPending || reviseMutation.isPending;

    const handleSaveEdit = () => {
        reviseMutation.mutate(
            {
                pendingChangeId: proposal.id,
                data: {
                    proposedDescription: draftDescription,
                    proposedTags: draftTags
                        .split(",")
                        .map(tag => tag.trim())
                        .filter(Boolean),
                    proposedState: proposal.proposedState ? draftState : undefined
                }
            },
            { onSuccess: () => setIsEditing(false) }
        );
    };

    return (
        <Card className={proposal.status !== "pending" && proposal.status !== "approved" ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">
                            {entryCategory}
                        </Badge>
                        {!isPending && (
                            <Badge variant={proposal.status === "approved" ? "default" : "outline"} className="capitalize">
                                {proposal.status}
                            </Badge>
                        )}
                    </div>
                </div>
                <span className="text-sm text-muted-foreground">
                    Proposes to {proposal.proposedNeedsFleshingOut ? "flesh out" : "update"} {entryName}
                </span>
            </CardHeader>
            <CardContent className="space-y-3">
                {isEditing ? (
                    <div className="space-y-2">
                        <Textarea
                            value={draftDescription}
                            onChange={e => setDraftDescription(e.target.value)}
                            rows={4}
                            className="text-sm"
                        />
                        <Input
                            value={draftTags}
                            onChange={e => setDraftTags(e.target.value)}
                            placeholder="tags, comma, separated"
                            className="text-sm"
                        />
                        {proposal.proposedState && <ProposedStateEditor state={draftState} onChange={setDraftState} />}
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveEdit} disabled={reviseMutation.isPending}>
                                {reviseMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                                Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm whitespace-pre-wrap">{proposal.proposedDescription}</p>
                        {proposal.proposedState && <ProposedStateSummary state={proposal.proposedState} />}
                    </>
                )}

                {isPending && !isEditing && (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => approveMutation.mutate(proposal.id)} disabled={isUpdating}>
                            {approveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4 mr-1" />
                            )}
                            Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} disabled={isUpdating}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate(proposal.id)} disabled={isUpdating}>
                            {rejectMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <X className="h-4 w-4 mr-1" />
                            )}
                            Reject
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
