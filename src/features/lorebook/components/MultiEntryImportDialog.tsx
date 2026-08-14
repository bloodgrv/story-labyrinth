import { attemptPromise } from "@jfdi/attempt";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EMPTY_CODEX_STATE } from "@/features/lorebook/components/form/entryFormUtils";
import { lorebookKeys } from "@/features/lorebook/hooks/useLorebookQuery";
import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { codexApi, lorebookApi } from "@/services/api/client";
import { randomUUID } from "@/utils/crypto";
import { useQueryClient } from "@tanstack/react-query";

interface MultiEntryImportDialogProps {
    storyId?: string;
    seriesId?: string;
    onCreated?: () => void;
    // Controlled mode (Brainstorm's checklist tray, see task 7): when `open`/`onOpenChange` are
    // supplied, this component renders no trigger button of its own and the caller owns
    // visibility. `initialDrafts` skips straight to the review list — Brainstorm's file-attach
    // already ran the same extraction (lorebookApi.importDocumentBatch) once when the drafts were
    // first produced; re-uploading here would just repeat an identical AI call for no reason.
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    initialDrafts?: DocumentImportDraft[];
}

// Multi-subject document import (2026-08-14) — the batch sibling of the existing single-entry
// "Import" flow (LorebookBrowsePanel.tsx's file input -> handleDocumentImport -> a draft tab).
// A reference document describing several characters/locations ("a character bible") gets one
// draft per subject here, reviewed as a checklist rather than opened as N separate draft tabs —
// each accepted draft is created for real (same create + codexApi.enable/recordState sequence
// LorebookEntryEditor.tsx's own handleSubmit uses for a brand-new entry), not just pre-filled
// into a form the user still has to individually save. Shared as-is by two entry points: the
// Lorebook toolbar's own "Import multiple" button (uncontrolled, owns the upload step) and
// Brainstorm's checklist tray (controlled, drafts already extracted — see task 7).
export function MultiEntryImportDialog({ storyId, seriesId, onCreated, open: openProp, onOpenChange, initialDrafts }: MultiEntryImportDialogProps) {
    const isControlled = openProp !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? openProp : internalOpen;
    const setOpen = (value: boolean) => {
        if (onOpenChange) onOpenChange(value);
        if (!isControlled) setInternalOpen(value);
    };

    const [isExtracting, setIsExtracting] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [drafts, setDrafts] = useState<DocumentImportDraft[]>(initialDrafts ?? []);
    const [selected, setSelected] = useState<Set<number>>(new Set((initialDrafts ?? []).map((_, i) => i)));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    const reset = () => {
        setDrafts(initialDrafts ?? []);
        setSelected(new Set((initialDrafts ?? []).map((_, i) => i)));
    };

    const handleFile = async (file: File) => {
        setIsExtracting(true);
        const [error, result] = await attemptPromise(() => lorebookApi.importDocumentBatch(file));
        setIsExtracting(false);
        if (error) {
            toast.error(error.message || "Failed to import document");
            return;
        }
        setDrafts(result.drafts);
        setSelected(new Set(result.drafts.map((_, i) => i)));
    };

    const toggle = (index: number) =>
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });

    const createOne = async (draft: DocumentImportDraft): Promise<void> => {
        const entryId = randomUUID();
        const level = seriesId ? "series" : storyId ? "story" : "global";
        const scopeId = seriesId || storyId || undefined;
        const codexEnabled = draft.category === "character" && JSON.stringify(draft.codexState) !== JSON.stringify(EMPTY_CODEX_STATE);

        await lorebookApi.create({
            id: entryId,
            level,
            scopeId,
            name: draft.name,
            description: draft.description,
            category: draft.category,
            tags: draft.tags,
            metadata: { importance: "minor", status: "active", type: "", relationships: [] },
            isDisabled: false,
            isDemo: false
        } as unknown as Omit<LorebookEntry, "createdAt">);

        if (codexEnabled) {
            await codexApi.enable(entryId, { sourceType: "user" });
            await codexApi.recordState(entryId, { changes: { codexState: draft.codexState }, sourceType: "user" });
        }

        if (draft.image) {
            const res = await fetch(draft.image.dataUrl);
            const blob = await res.blob();
            await lorebookApi.uploadImage(entryId, new File([blob], draft.image.filename, { type: blob.type }));
        }
    };

    const handleCreateSelected = async () => {
        setIsCreating(true);
        let created = 0;
        let failed = 0;
        for (const index of selected) {
            const [error] = await attemptPromise(() => createOne(drafts[index]));
            if (error) failed++;
            else created++;
        }
        setIsCreating(false);

        await queryClient.invalidateQueries({ queryKey: lorebookKeys.all });
        if (created > 0) toast.success(`Created ${created} entr${created === 1 ? "y" : "ies"}${failed ? `, ${failed} failed` : ""}`);
        else toast.error("Nothing was created");

        setOpen(false);
        reset();
        onCreated?.();
    };

    const dialog = (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Import multiple entries</DialogTitle>
                </DialogHeader>

                {drafts.length === 0 ? (
                    <div className="py-8 flex flex-col items-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">
                            Upload a PDF, DOCX, MD, or TXT document describing several characters/locations — each will be
                            extracted as its own reviewable entry.
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,.md,.txt"
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) void handleFile(file);
                                e.target.value = "";
                            }}
                        />
                        <Button onClick={() => fileInputRef.current?.click()} disabled={isExtracting}>
                            {isExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            {isExtracting ? "Analyzing..." : "Choose file"}
                        </Button>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                        {drafts.map((draft, index) => (
                            <div key={index} className="flex items-start gap-2 border rounded p-2">
                                <Switch checked={selected.has(index)} onCheckedChange={() => toggle(index)} className="mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium truncate">{draft.name}</span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            {draft.category}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{draft.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isCreating}>
                        Cancel
                    </Button>
                    {drafts.length > 0 && (
                        <Button onClick={() => void handleCreateSelected()} disabled={selected.size === 0 || isCreating}>
                            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create {selected.size} {selected.size === 1 ? "entry" : "entries"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    if (isControlled) return dialog;

    return (
        <>
            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                title="Import multiple entries from one document"
                onClick={() => {
                    reset();
                    setOpen(true);
                }}
            >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Import multiple</span>
            </Button>
            {dialog}
        </>
    );
}
