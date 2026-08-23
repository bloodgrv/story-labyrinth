import { attemptPromise } from "@jfdi/attempt";
import { Eye, EyeOff, Loader2, Lock, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { EMPTY_CODEX_STATE } from "@/features/lorebook/components/form/entryFormUtils";
import { usePersistedState } from "@/lib/usePersistedState";
import { cn } from "@/lib/utils";
import { codexApi } from "@/services/api/client";
import type { CodexSecretItem, CodexState } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";

interface LorebookSecretsPanelProps {
    storyId?: string;
    entries: LorebookEntry[];
    onOpenEntry: (entry: LorebookEntry) => void;
    onChanged: () => void;
}

interface SecretRow {
    entry: LorebookEntry;
    secret: CodexSecretItem;
}

// Story-wide Secrets panel (2026-08-14 follow-up to Codex secrets) — every hidden/revealed secret
// across every character in this story, in one place, since per-entry-only visibility means
// checking N entries individually to answer "what's still hidden right now." Read/write goes
// straight through the same codexApi.recordState the per-entry SecretsBox uses (no new server
// route) — this panel just aggregates across entries client-side and edits one entry's `secrets`
// array at a time, same as toggling from inside that entry's own editor would.
export function LorebookSecretsPanel({ storyId, entries, onOpenEntry, onChanged }: LorebookSecretsPanelProps) {
    const [filter, setFilter] = usePersistedState<"all" | "hidden" | "revealed">(
        "sn-lorebook-secrets-filter",
        "all",
        (v): v is "all" | "hidden" | "revealed" => v === "all" || v === "hidden" || v === "revealed"
    );
    const [busyId, setBusyId] = useState<string | null>(null);
    const chaptersQuery = useChaptersByStoryQuery(storyId ?? "");
    const chapterById = new Map((chaptersQuery.data ?? []).map(c => [c.id, c]));

    // Quick-add (2026-08-14 follow-up) — a real shortcut, not a placeholder: picks a character
    // entry and writes a new secret straight into its codexState via the same codexApi calls the
    // per-entry SecretsBox uses (enabling Codex tracking first if this entry hasn't got it on
    // yet, same as LorebookEntryEditor.tsx's own handleSubmit does for a brand-new entry). Still
    // nudges toward the entry's own editor when the secret is really "about" that character's
    // established facts — this form only ever takes free text, with no access to the rest of that
    // entry's Codex state to cross-reference against while writing it.
    const [addOpen, setAddOpen] = useState(false);
    const [addEntryId, setAddEntryId] = useState<string>("");
    const [addValue, setAddValue] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const characterEntries = [...entries].filter(e => e.category === "character").sort((a, b) => a.name.localeCompare(b.name));

    const addSecret = async () => {
        const entry = entries.find(e => e.id === addEntryId);
        if (!entry || !addValue.trim()) return;
        setIsAdding(true);

        if (!entry.codexEnabled) {
            const [enableError] = await attemptPromise(() => codexApi.enable(entry.id, { sourceType: "user" }));
            if (enableError) {
                setIsAdding(false);
                toast.error(enableError.message || "Failed to enable Codex tracking for this entry");
                return;
            }
        }

        const baseState = entry.codexState ?? EMPTY_CODEX_STATE;
        const nextState: CodexState = {
            ...baseState,
            secrets: [...(baseState.secrets ?? []), { id: randomUUID(), value: addValue.trim(), revealed: false, revealedAtChapterId: null }]
        };
        const [error] = await attemptPromise(() =>
            codexApi.recordState(entry.id, { changes: { codexState: nextState }, sourceType: "user" })
        );
        setIsAdding(false);
        if (error) {
            toast.error(error.message || "Failed to add secret");
            return;
        }
        setAddValue("");
        setAddEntryId("");
        setAddOpen(false);
        onChanged();
    };

    const rows: SecretRow[] = entries
        .filter(e => e.category === "character" && e.codexEnabled && (e.codexState?.secrets?.length ?? 0) > 0)
        .flatMap(entry => (entry.codexState!.secrets ?? []).map(secret => ({ entry, secret })))
        .filter(row => (filter === "all" ? true : filter === "hidden" ? !row.secret.revealed : row.secret.revealed));

    const toggleRevealed = async ({ entry, secret }: SecretRow) => {
        if (!entry.codexState) return;
        setBusyId(secret.id);
        const nextSecrets = (entry.codexState.secrets ?? []).map(s => (s.id === secret.id ? { ...s, revealed: !s.revealed } : s));
        const nextState: CodexState = { ...entry.codexState, secrets: nextSecrets };
        const [error] = await attemptPromise(() =>
            codexApi.recordState(entry.id, { changes: { codexState: nextState }, sourceType: "user" })
        );
        setBusyId(null);
        if (error) {
            toast.error(error.message || "Failed to update secret");
            return;
        }
        onChanged();
    };

    const setRevealChapter = async ({ entry, secret }: SecretRow, chapterId: string | null) => {
        if (!entry.codexState) return;
        setBusyId(secret.id);
        const nextSecrets = (entry.codexState.secrets ?? []).map(s =>
            s.id === secret.id ? { ...s, revealedAtChapterId: chapterId } : s
        );
        const nextState: CodexState = { ...entry.codexState, secrets: nextSecrets };
        const [error] = await attemptPromise(() =>
            codexApi.recordState(entry.id, { changes: { codexState: nextState }, sourceType: "user" })
        );
        setBusyId(null);
        if (error) {
            toast.error(error.message || "Failed to update secret");
            return;
        }
        onChanged();
    };

    const hiddenCount = entries
        .filter(e => e.category === "character" && e.codexEnabled)
        .flatMap(e => e.codexState?.secrets ?? [])
        .filter(s => !s.revealed).length;

    return (
        <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Secrets</h2>
                    {hiddenCount > 0 && (
                        <Badge variant="secondary" className="font-normal">
                            {hiddenCount} hidden
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Tabs value={filter} onValueChange={value => setFilter(value as typeof filter)}>
                        <TabsList>
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="hidden">Hidden</TabsTrigger>
                            <TabsTrigger value="revealed">Revealed</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(v => !v)}>
                        {addOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        Add secret
                    </Button>
                </div>
            </div>

            {addOpen && (
                <div className="border rounded p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                        Quick-add for a character you already have in mind. If this secret is really about facts
                        you're already establishing for that character (appearance, wardrobe, backstory), it's often
                        better to add it <strong>from that entry's own Codex</strong> instead — you'll have the rest
                        of their state right there to write it consistently against.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                        <Select value={addEntryId} onValueChange={setAddEntryId}>
                            <SelectTrigger className="w-56">
                                <SelectValue placeholder="Choose a character..." />
                            </SelectTrigger>
                            <SelectContent>
                                {characterEntries.map(entry => (
                                    <SelectItem key={entry.id} value={entry.id}>
                                        {entry.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            value={addValue}
                            onChange={e => setAddValue(e.target.value)}
                            placeholder="Secret text..."
                            className="flex-1 min-w-[200px]"
                            onKeyDown={e => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void addSecret();
                                }
                            }}
                        />
                        <Button size="sm" onClick={() => void addSecret()} disabled={!addEntryId || !addValue.trim() || isAdding}>
                            {isAdding && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                            Add
                        </Button>
                    </div>
                </div>
            )}

            {rows.length === 0 ? (
                <EmptyState
                    message={
                        filter === "all"
                            ? "No secrets tracked yet in this story."
                            : `No ${filter} secrets.`
                    }
                />
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                    {rows.map(row => {
                        const chapter = row.secret.revealedAtChapterId ? chapterById.get(row.secret.revealedAtChapterId) : undefined;
                        const isBusy = busyId === row.secret.id;
                        return (
                            <div key={row.secret.id} className="flex items-start gap-2 border rounded p-3">
                                <button
                                    type="button"
                                    onClick={() => void toggleRevealed(row)}
                                    disabled={isBusy}
                                    title={row.secret.revealed ? "Revealed — click to hide again" : "Hidden — click to reveal now"}
                                    className={cn(
                                        "mt-0.5 shrink-0 rounded p-1",
                                        row.secret.revealed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                    )}
                                >
                                    {isBusy ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : row.secret.revealed ? (
                                        <Eye className="h-4 w-4" />
                                    ) : (
                                        <EyeOff className="h-4 w-4" />
                                    )}
                                </button>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <p className="text-sm break-words">{row.secret.value}</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="h-auto p-0 text-xs"
                                            onClick={() => onOpenEntry(row.entry)}
                                        >
                                            {row.entry.name}
                                        </Button>
                                        <Badge variant={row.secret.revealed ? "default" : "secondary"} className="text-[10px]">
                                            {row.secret.revealed ? "Revealed" : "Hidden"}
                                        </Badge>
                                        {storyId && (
                                            <Select
                                                value={row.secret.revealedAtChapterId ?? "__none__"}
                                                onValueChange={value => void setRevealChapter(row, value === "__none__" ? null : value)}
                                            >
                                                <SelectTrigger className="h-6 text-xs w-44">
                                                    <SelectValue placeholder="Reveal at chapter..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__none__">No auto-reveal chapter</SelectItem>
                                                    {[...(chaptersQuery.data ?? [])]
                                                        .sort((a, b) => a.order - b.order)
                                                        .map(c => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                Ch. {c.order}: {c.title}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        {!storyId && chapter && (
                                            <span className="text-xs text-muted-foreground">Reveals at Ch. {chapter.order}: {chapter.title}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
