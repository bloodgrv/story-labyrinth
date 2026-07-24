import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, Link2, Loader2, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
    useAcceptOutlineImportBatchMutation,
    useActiveOutlineImportBatchQuery,
    useDiscardOutlineImportBatchMutation,
    useUpdateOutlineImportBatchMutation,
    useUpdateOutlineImportChecklistMutation,
    useUploadOutlineImportMutation
} from "@/features/outline/hooks/useOutlineImportQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { outlineCharactersApi } from "@/services/api/client";
import type { LorebookEntry } from "@/types/story";
import type {
    AcceptedOutlineItemRef,
    DraftChapter,
    ImportArcNotePayload,
    ImportCastPayload,
    OutlineImportBatch,
    OutlineImportChecklistItem,
    OutlineImportMode
} from "@/types/outlineImport";

interface OutlineImportPanelProps {
    storyId: string;
    characters: LorebookEntry[];
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.md,.txt";

// Outline Import (docs/Outline_Import_Design.md, OI5) — panel-side surface: "Import structure…"
// trigger when idle, editable structure draft + rich-lane tray once a batch exists. One draft
// model (design lock #5): dense edit/reorder lives here, the Outline chat side (OI6) only shows a
// compact "Structure ready" card pointing back at this panel.
export function OutlineImportPanel({ storyId, characters }: OutlineImportPanelProps) {
    const { data, isLoading } = useActiveOutlineImportBatchQuery(storyId);
    const uploadMutation = useUploadOutlineImportMutation(storyId);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const batch = data?.batch ?? null;

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        uploadMutation.mutate({ file });
    };

    return (
        <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={handleFileSelected} />
            {!batch && (
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending || isLoading}>
                    {uploadMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                    Import structure…
                </Button>
            )}
            {batch && <OutlineImportDraft storyId={storyId} batch={batch} checklist={data?.checklist ?? []} characters={characters} />}
        </div>
    );
}

function OutlineImportDraft({
    storyId,
    batch,
    checklist,
    characters
}: {
    storyId: string;
    batch: OutlineImportBatch;
    checklist: OutlineImportChecklistItem[];
    characters: LorebookEntry[];
}) {
    const updateMutation = useUpdateOutlineImportBatchMutation(storyId, batch.id);
    const acceptMutation = useAcceptOutlineImportBatchMutation(storyId);
    const discardMutation = useDiscardOutlineImportBatchMutation(storyId);
    const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

    // Local-first edit state: text edits update this instantly (no network round-trip per
    // keystroke) and only PATCH the server on blur; reorder/remove buttons update both at once
    // since they're low-frequency clicks, not keystrokes. Resyncs from the server whenever the
    // batch identity changes (a fresh upload) — not on every batch refetch, or an in-flight local
    // edit would be clobbered by its own still-catching-up query cache.
    const [draft, setDraft] = useState<DraftChapter[]>(batch.structureDraft);
    const [syncedBatchId, setSyncedBatchId] = useState(batch.id);
    if (batch.id !== syncedBatchId) {
        setDraft(batch.structureDraft);
        setSyncedBatchId(batch.id);
    }

    const isBusy = updateMutation.isPending || acceptMutation.isPending || discardMutation.isPending;

    const persistDraft = (next: DraftChapter[]) => updateMutation.mutate({ structureDraft: next });

    const removeChapter = (index: number) => {
        const next = draft.filter((_, i) => i !== index);
        setDraft(next);
        persistDraft(next);
    };

    const moveChapter = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= draft.length) return;
        const next = [...draft];
        [next[index], next[target]] = [next[target], next[index]];
        setDraft(next);
        persistDraft(next);
    };

    const editChapterLocal = (index: number, patch: Partial<DraftChapter>) =>
        setDraft(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

    const removeScene = (chapterIndex: number, sceneIndex: number) => {
        const next = draft.map((c, i) => (i === chapterIndex ? { ...c, scenes: c.scenes.filter((_, j) => j !== sceneIndex) } : c));
        setDraft(next);
        persistDraft(next);
    };

    const moveScene = (chapterIndex: number, sceneIndex: number, dir: -1 | 1) => {
        const chapter = draft[chapterIndex];
        const target = sceneIndex + dir;
        if (target < 0 || target >= chapter.scenes.length) return;
        const scenes = [...chapter.scenes];
        [scenes[sceneIndex], scenes[target]] = [scenes[target], scenes[sceneIndex]];
        const next = draft.map((c, i) => (i === chapterIndex ? { ...c, scenes } : c));
        setDraft(next);
        persistDraft(next);
    };

    const editSceneLocal = (chapterIndex: number, sceneIndex: number, patch: Partial<DraftChapter["scenes"][number]>) =>
        setDraft(prev =>
            prev.map((c, i) =>
                i === chapterIndex ? { ...c, scenes: c.scenes.map((s, j) => (j === sceneIndex ? { ...s, ...patch } : s)) } : c
            )
        );

    const handleModeChange = (mode: OutlineImportMode) => {
        if (mode === "replace") {
            setReplaceConfirmOpen(true);
            return;
        }
        updateMutation.mutate({ mode });
    };

    const confirmReplace = () => {
        setReplaceConfirmOpen(false);
        updateMutation.mutate({ mode: "replace" });
    };

    // Once accepted/discarded, the structure draft itself is resolved — only the rich-lane tray
    // (design lock #16) can still have unresolved work, which is the only reason GET / would even
    // surface this batch anymore (see outlineImport.ts's GET / route). No editable tree, no
    // mode/arm controls, no Accept/Discard — just a compact status line + the tray. All hooks
    // above still ran unconditionally either way (rules of hooks) — this branch only affects JSX.
    if (batch.status === "accepted" || batch.status === "discarded")
        return (
            <Card>
                <CardHeader className="pb-2">
                    <p className="text-sm font-medium">
                        {batch.status === "accepted" ? "Structure imported" : "Import discarded"} — {batch.sourceFilename}
                    </p>
                </CardHeader>
                <CardContent>
                    {checklist.length > 0 && (
                        <OutlineImportTray storyId={storyId} checklist={checklist} batch={batch} characters={characters} />
                    )}
                </CardContent>
            </Card>
        );

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="text-sm font-medium">Structure draft — {batch.sourceFilename}</p>
                        <p className="text-xs text-muted-foreground">
                            {draft.length} chapter{draft.length === 1 ? "" : "s"} ·{" "}
                            {draft.reduce((n, c) => n + c.scenes.length, 0)} scene(s)
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            size="sm"
                            variant={batch.mode === "append" ? "default" : "outline"}
                            onClick={() => handleModeChange("append")}
                            disabled={isBusy}
                        >
                            Append
                        </Button>
                        <Button
                            size="sm"
                            variant={batch.mode === "replace" ? "destructive" : "outline"}
                            onClick={() => handleModeChange("replace")}
                            disabled={isBusy}
                        >
                            Replace all
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                    <Switch
                        checked={batch.includeInAiArm}
                        onCheckedChange={checked => updateMutation.mutate({ includeInAiArm: checked })}
                        disabled={isBusy}
                    />
                    <span className="text-xs text-muted-foreground">
                        Arm for AI (include these items in chat context once accepted)
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {draft.map((chapter, chapterIndex) => (
                        <div key={chapter.tempId} className="rounded-md border border-input p-2 space-y-2">
                            <div className="flex items-start gap-2">
                                <div className="flex flex-col">
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveChapter(chapterIndex, -1)} disabled={chapterIndex === 0 || isBusy}>
                                        <ChevronUp className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveChapter(chapterIndex, 1)} disabled={chapterIndex === draft.length - 1 || isBusy}>
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <Input
                                        value={chapter.title}
                                        onChange={e => editChapterLocal(chapterIndex, { title: e.target.value })}
                                        onBlur={() => persistDraft(draft)}
                                        className="h-8 font-medium"
                                    />
                                    <Textarea
                                        value={chapter.summary ?? ""}
                                        placeholder="Summary…"
                                        onChange={e => editChapterLocal(chapterIndex, { summary: e.target.value || null })}
                                        onBlur={() => persistDraft(draft)}
                                        className="min-h-14 text-xs"
                                    />
                                </div>
                                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeChapter(chapterIndex)} disabled={isBusy}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>

                            {chapter.scenes.length > 0 && (
                                <div className="ml-6 space-y-1.5 border-l border-input pl-3">
                                    {chapter.scenes.map((scene, sceneIndex) => (
                                        <div key={scene.tempId} className="flex items-start gap-2">
                                            <div className="flex flex-col">
                                                <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => moveScene(chapterIndex, sceneIndex, -1)} disabled={sceneIndex === 0 || isBusy}>
                                                    <ChevronUp className="h-2.5 w-2.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => moveScene(chapterIndex, sceneIndex, 1)} disabled={sceneIndex === chapter.scenes.length - 1 || isBusy}>
                                                    <ChevronDown className="h-2.5 w-2.5" />
                                                </Button>
                                            </div>
                                            <Input
                                                value={scene.title}
                                                onChange={e => editSceneLocal(chapterIndex, sceneIndex, { title: e.target.value })}
                                                onBlur={() => persistDraft(draft)}
                                                className="h-7 text-xs"
                                            />
                                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeScene(chapterIndex, sceneIndex)} disabled={isBusy}>
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-input pt-3">
                    <Button size="sm" variant="ghost" onClick={() => discardMutation.mutate({ batchId: batch.id })} disabled={isBusy}>
                        Discard
                    </Button>
                    <Button size="sm" onClick={() => acceptMutation.mutate(batch.id)} disabled={isBusy || draft.length === 0}>
                        {acceptMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                        Accept ({batch.mode === "replace" ? "replace all" : "append"})
                    </Button>
                </div>

                {checklist.length > 0 && (
                    <OutlineImportTray storyId={storyId} checklist={checklist} batch={batch} characters={characters} />
                )}
            </CardContent>

            <AlertDialog open={replaceConfirmOpen} onOpenChange={setReplaceConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            Replace the entire outline?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Accepting in Replace mode deletes every existing outline item for this story (chapters, scenes, and
                            any character-arc links on them) before inserting this draft. Your chapters' prose is not affected.
                            This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmReplace}>Use Replace mode</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

// Rich lane (design lock #12/#13) — cast mentions and arc notes found during extract, never
// silently written. Same B4 morals as BrainstormChecklistTray.tsx: Open sets "opened" and stays
// in Active, only Mark done/Dismiss leaves it.
function OutlineImportTray({
    storyId,
    checklist,
    batch,
    characters
}: {
    storyId: string;
    checklist: OutlineImportChecklistItem[];
    batch: OutlineImportBatch;
    characters: LorebookEntry[];
}) {
    const [statusTab, setStatusTab] = useState<"active" | "done">("active");
    const updateStatus = useUpdateOutlineImportChecklistMutation(storyId);
    const { setPendingLorebookSeed, setCurrentTool } = useStoryContext();
    // OI7 — per-row picker state for "Link to outline item" (post-Accept only).
    const [linkSelections, setLinkSelections] = useState<Record<string, { itemId: string; characterId: string }>>({});
    const [linkingId, setLinkingId] = useState<string | null>(null);

    const visible = checklist.filter(item =>
        statusTab === "active" ? item.status === "pending" || item.status === "opened" : item.status === "done" || item.status === "dismissed"
    );

    const handleOpenCast = (item: OutlineImportChecklistItem) => {
        const payload = item.payload as ImportCastPayload;
        setPendingLorebookSeed({ name: payload.name, category: "character", blurb: payload.context });
        setCurrentTool("lorebook");
        updateStatus.mutate({ id: item.id, status: "opened" });
    };

    // Post-Accept only (design lock: "Link resolved character <-> outline item only after spine
    // rows exist"). batch.acceptedItemIds is only populated once Accept has run — see
    // outlineImport.ts's acceptBatch.
    const handleLinkCast = async (item: OutlineImportChecklistItem) => {
        const selection = linkSelections[item.id];
        if (!selection?.itemId || !selection?.characterId) return;
        const payload = item.payload as ImportCastPayload;
        setLinkingId(item.id);
        try {
            await outlineCharactersApi.create({
                outlineItemId: selection.itemId,
                storyId,
                characterId: selection.characterId,
                arcNote: payload.context || null
            });
            updateStatus.mutate({ id: item.id, status: "done" });
        } finally {
            setLinkingId(null);
        }
    };

    return (
        <div className="space-y-2 border-t border-input pt-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Import tray</p>
                <Tabs value={statusTab} onValueChange={v => setStatusTab(v as "active" | "done")}>
                    <TabsList className="h-7">
                        <TabsTrigger value="active" className="h-6 px-2 text-xs">
                            Active
                        </TabsTrigger>
                        <TabsTrigger value="done" className="h-6 px-2 text-xs">
                            Done
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {visible.length === 0 ? (
                <p className="p-2 text-center text-xs text-muted-foreground">No {statusTab} items.</p>
            ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                    {visible.map(item => {
                        const isCast = item.kind === "import_cast";
                        const payload = item.payload as ImportCastPayload | ImportArcNotePayload;
                        const label = isCast ? `Cast: ${(payload as ImportCastPayload).name}` : `Arc note: ${(payload as ImportArcNotePayload).subject}`;
                        const body = isCast ? (payload as ImportCastPayload).context : (payload as ImportArcNotePayload).text;

                        return (
                            <Card key={item.id} className={item.status !== "pending" ? "opacity-80" : undefined}>
                                <CardContent className="space-y-1.5 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <Badge variant="outline" className="text-xs">
                                            {label}
                                        </Badge>
                                        {item.status !== "pending" && (
                                            <Badge variant={item.status === "done" ? "default" : "outline"} className="text-xs capitalize">
                                                {item.status}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs whitespace-pre-wrap text-muted-foreground">{body}</p>
                                    {statusTab === "active" && isCast && batch.status === "accepted" && batch.acceptedItemIds && (
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                            <Select
                                                value={linkSelections[item.id]?.itemId ?? ""}
                                                onValueChange={value =>
                                                    setLinkSelections(prev => ({ ...prev, [item.id]: { ...prev[item.id], itemId: value } }))
                                                }
                                            >
                                                <SelectTrigger className="h-6 w-32 text-xs">
                                                    <SelectValue placeholder="Chapter/scene" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {batch.acceptedItemIds.map((ref: AcceptedOutlineItemRef) => (
                                                        <SelectItem key={ref.id} value={ref.id}>
                                                            {ref.type === "scene" ? "— " : ""}
                                                            {ref.title}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={linkSelections[item.id]?.characterId ?? ""}
                                                onValueChange={value =>
                                                    setLinkSelections(prev => ({ ...prev, [item.id]: { ...prev[item.id], characterId: value } }))
                                                }
                                            >
                                                <SelectTrigger className="h-6 w-32 text-xs">
                                                    <SelectValue placeholder="Character" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {characters.map(character => (
                                                        <SelectItem key={character.id} value={character.id}>
                                                            {character.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {statusTab === "active" && (
                                        <div className="flex gap-1.5 pt-1">
                                            {isCast && batch.status !== "accepted" && (
                                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => handleOpenCast(item)}>
                                                    <ExternalLink className="mr-1 h-3 w-3" />
                                                    Open in WB
                                                </Button>
                                            )}
                                            {isCast && batch.status === "accepted" && batch.acceptedItemIds && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-2 text-xs"
                                                    disabled={!linkSelections[item.id]?.itemId || !linkSelections[item.id]?.characterId || linkingId === item.id}
                                                    onClick={() => void handleLinkCast(item)}
                                                >
                                                    <Link2 className="mr-1 h-3 w-3" />
                                                    Link
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-xs"
                                                onClick={() => updateStatus.mutate({ id: item.id, status: "dismissed" })}
                                            >
                                                Dismiss
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
