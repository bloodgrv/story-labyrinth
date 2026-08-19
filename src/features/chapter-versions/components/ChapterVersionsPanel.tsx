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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
    useChapterVersionsQuery,
    useCompileVersionMutation,
    useDeleteVersionMutation,
    useDuplicateVersionMutation,
    useSetVersionLabelMutation
} from "@/features/chapter-versions/hooks/useChapterVersionsQuery";
import { cn } from "@/lib/utils";
import type { ChapterVersion } from "@/types/chapterVersion";
import { GenerateVersionDialog } from "./GenerateVersionDialog";
import { VersionEditor } from "./VersionEditor";

interface ChapterVersionsPanelProps {
    chapterId: string;
    children: ReactNode; // the main chapter's live editor content (EditorMultiView etc.)
}

// Tab strip + content switch for a chapter's alternate drafts. "Main" is always the first tab
// and represents the live chapter (children, passed through unchanged) — versions are flat
// siblings shown alongside it, never wired into what the editor/RAG/export treat as "the
// chapter" except via the explicit Compile action. See DECISIONS.md's "Story-Layer Chapter
// Versioning" entry for why this isn't a linear undo-history feature.
export function ChapterVersionsPanel({ chapterId, children }: ChapterVersionsPanelProps) {
    const { data } = useChapterVersionsQuery(chapterId);
    const versions = useMemo(() => data?.versions ?? [], [data]);

    const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
    const [compareMode, setCompareMode] = useState(false);
    const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [compileTarget, setCompileTarget] = useState<string | null>(null);
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [labelDraft, setLabelDraft] = useState("");

    const duplicateMutation = useDuplicateVersionMutation(chapterId);
    const setLabelMutation = useSetVersionLabelMutation(chapterId);
    const compileMutation = useCompileVersionMutation(chapterId);
    const deleteMutation = useDeleteVersionMutation(chapterId);

    // Chapter switched — versions belong to the previous chapter, drop any active selection.
    useEffect(() => {
        setActiveVersionId(null);
        setCompareMode(false);
    }, [chapterId]);

    // Active version deleted out from under us (e.g. from another tab/session) — fall back to Main.
    useEffect(() => {
        if (activeVersionId && !versions.some(v => v.id === activeVersionId)) setActiveVersionId(null);
    }, [versions, activeVersionId]);

    const activeVersion = versions.find(v => v.id === activeVersionId) ?? null;

    // Stable "Version N" fallback numbering (oldest = 1), independent of the list's newest-first
    // display order and stable as new versions are added.
    const versionNumbers = new Map(
        [...versions]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((v, i) => [v.id, i + 1] as const)
    );

    const labelInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (editingLabelId) labelInputRef.current?.focus();
    }, [editingLabelId]);

    const startEditingLabel = (version: ChapterVersion) => {
        setEditingLabelId(version.id);
        setLabelDraft(version.label ?? "");
    };

    const commitLabel = () => {
        if (editingLabelId) setLabelMutation.mutate({ versionId: editingLabelId, label: labelDraft.trim() || null });
        setEditingLabelId(null);
    };

    return (
        <div className="flex h-full w-full min-w-0 flex-col">
            <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1">
                <Button
                    size="sm"
                    variant={activeVersionId === null ? "secondary" : "ghost"}
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => setActiveVersionId(null)}
                >
                    Main
                </Button>

                {versions.map(version => (
                    <div
                        key={version.id}
                        className={cn(
                            "group flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs",
                            activeVersionId === version.id ? "bg-secondary" : "hover:bg-muted"
                        )}
                    >
                        <button
                            type="button"
                            className="flex items-center gap-1"
                            onClick={() => setActiveVersionId(version.id)}
                        >
                            {version.sourceType === "ai" ? <Sparkles className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {editingLabelId === version.id ? (
                                <Input
                                    ref={labelInputRef}
                                    value={labelDraft}
                                    onChange={e => setLabelDraft(e.target.value)}
                                    onBlur={commitLabel}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") commitLabel();
                                        if (e.key === "Escape") setEditingLabelId(null);
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    className="h-5 w-28 text-xs"
                                />
                            ) : (
                                <span onDoubleClick={() => startEditingLabel(version)} title="Double-click to rename">
                                    {version.label ?? `Version ${versionNumbers.get(version.id)}`}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100"
                            title="Delete version"
                            onClick={() => setDeleteTarget(version.id)}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ))}

                {/* B5 fix (2026-08-19): this used to be a single icon-only Radix DropdownMenu trigger
                    whose "New version" text existed only as an HTML title tooltip — Radix opens a
                    dropdown trigger on pointerdown rather than click, which made it invisible to
                    (and untestable by) anything that only synthesizes a plain click event, and gave
                    a first-time human user no visible label for what the button does either. Two
                    explicit, always-visible, plain-onClick buttons instead — fires for real pointers,
                    synthetic clicks, and keyboard/assistive-tech alike, no dropdown required for just
                    two actions. */}
                <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => setGenerateDialogOpen(true)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    New version
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 gap-1 px-2 text-xs"
                    disabled={duplicateMutation.isPending}
                    onClick={() => duplicateMutation.mutate(undefined)}
                    title="Duplicate Main as a new version"
                >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                </Button>

                {activeVersion && (
                    <div className="ml-auto flex shrink-0 items-center gap-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCompileTarget(activeVersion.id)}>
                            Compile to Main
                        </Button>
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="version-compare-toggle" className="text-xs text-muted-foreground">
                                Compare
                            </Label>
                            <Switch id="version-compare-toggle" checked={compareMode} onCheckedChange={setCompareMode} />
                        </div>
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                {!activeVersion && <div className="flex h-full justify-center overflow-x-hidden">{children}</div>}
                {activeVersion && !compareMode && <VersionEditor chapterId={chapterId} version={activeVersion} />}
                {activeVersion && compareMode && (
                    <div className="flex h-full">
                        <div className="flex min-w-0 flex-1 justify-center overflow-hidden border-r">{children}</div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                            <VersionEditor chapterId={chapterId} version={activeVersion} />
                        </div>
                    </div>
                )}
            </div>

            <GenerateVersionDialog chapterId={chapterId} open={generateDialogOpen} onOpenChange={setGenerateDialogOpen} />

            <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this version?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This draft will be permanently deleted. The main chapter is unaffected.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (deleteTarget) deleteMutation.mutate(deleteTarget);
                                setDeleteTarget(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!compileTarget} onOpenChange={open => !open && setCompileTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Compile this version into the main chapter?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This overwrites the main chapter's current content with this version's content. There is
                            no automatic backup of what's being replaced — this cannot be undone from here.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (compileTarget) compileMutation.mutate(compileTarget);
                                setCompileTarget(null);
                            }}
                        >
                            Compile
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
