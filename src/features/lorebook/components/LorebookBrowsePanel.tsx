import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Download, Loader2, Lock, Plus, RefreshCw, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LorebookFolderSidebar } from "@/features/folders/components/LorebookFolderSidebar";
import { useReorderFoldersMutation } from "@/features/folders/hooks/useFoldersQuery";
import type { OrgFolder } from "@/types/folders";
import type { LorebookEntry } from "@/types/story";
import { useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { CATEGORIES, type LorebookCategory } from "./form";
import { LorebookEntryList } from "./LorebookEntryList";
import { MultiEntryImportDialog } from "./MultiEntryImportDialog";

// Must be a stable reference — useSensor/useSensors re-memoize on options identity, and a fresh
// object literal every render defeats that memoization (dnd-kit's own internal effects then see
// a "new" sensor list every render, which is where the console warning came from).
const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 };

interface LorebookBrowsePanelProps {
    seriesId?: string;
    storyId?: string;
    selectedCategory: LorebookCategory;
    onCategoryChange: (category: LorebookCategory) => void;
    categoryCounts: Record<LorebookCategory, number>;
    entriesByCategory: LorebookEntry[];
    isLoading: boolean;
    onRefresh: () => void;
    isRefreshing: boolean;
    onExport: () => void;
    onImport: (event: ChangeEvent<HTMLInputElement>) => void;
    isImportingDocument: boolean;
    onOpenEntry: (entry: LorebookEntry) => void;
    onNewEntry: () => void;
    onOpenSecrets: () => void;
    // Full, unfiltered-by-category entry list for this scope — threaded down to
    // LorebookEntryList's "All categories" search toggle. See its own prop comment.
    allEntries?: LorebookEntry[];
    // Folders (B9, docs/Folders_Org_Design.md) — scope undefined (no story/series id) means the
    // sidebar simply doesn't render (global entries have no folder tree).
    folderProps: {
        scope?: { level: "series" | "story"; scopeId: string };
        folders: OrgFolder[];
        selectedFolderId: string | null;
        onFolderChange: (folderId: string | null) => void;
        includeDescendants: boolean;
        onIncludeDescendantsChange: (value: boolean) => void;
    };
}

// The default "Browse" tab's content — header, export/import controls, category selector, and
// the card grid. Extracted out of LorebookPage.tsx to keep that file under the project's
// max-lines limit once the open-tabs strip and document-import wiring were added.
export function LorebookBrowsePanel({
    seriesId,
    storyId,
    selectedCategory,
    onCategoryChange,
    categoryCounts,
    entriesByCategory,
    isLoading,
    onRefresh,
    isRefreshing,
    onExport,
    onImport,
    isImportingDocument,
    onOpenEntry,
    onNewEntry,
    onOpenSecrets,
    folderProps,
    allEntries
}: LorebookBrowsePanelProps) {
    const updateLorebookMutation = useUpdateLorebookMutation();
    const reorderFoldersMutation = useReorderFoldersMutation();
    // DraggableLeaf spreads pointer listeners across the whole card/row (no dedicated drag
    // handle), so the default zero-distance PointerSensor treats the sub-pixel movement in an
    // ordinary click as a drag start and swallows the click before LorebookEntryCard/Row's
    // onClick ever fires. A small activation distance lets real clicks through. KeyboardSensor
    // is for the folder-reorder SortableContexts (LorebookFolderTreeRow/Sidebar) — DraggableLeaf
    // itself has no keyboard equivalent, unaffected.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION_CONSTRAINT }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Drag an entry (LorebookEntryList's DraggableLeaf) onto a folder row or "Unfiled" (both
    // FolderDropZone in LorebookFolderSidebar) to file it — folder-onto-folder reparenting goes
    // through the "Move to…" dialog instead (B9 plan decision #7), so this only ever sees
    // lorebook-entry drags landing on a lorebook-folder target.
    //
    // Folder-onto-folder SAME-PARENT drags (LorebookFolderTreeRow's own useSortable, "sort:" id
    // namespace) reorder siblings — cross-parent drops are deliberately ignored here too (same
    // B9 plan decision #7 reasoning above), so this never reparents, only reorders.
    //
    // A folder row registers TWO overlapping droppable targets on the same physical element:
    // FolderDropZone ("lorebook-folder", for entry-filing) and the row's own useSortable
    // ("lorebook-folder-sort", for reordering). dnd-kit's default collision detection can resolve
    // `over` to EITHER one regardless of which gesture is actually in progress (verified live —
    // a folder-sort drag consistently resolved `over` to the FolderDropZone registration, not the
    // sortable one), so both branches below normalize `over` to "which folder row" first, rather
    // than trusting its exact type to match the active drag's own type.
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeData = active.data.current as
            | { type?: string; leafId?: string; folderId?: string; parentId?: string | null }
            | undefined;
        const overData = over.data.current as
            | { type?: string; targetFolderId?: string | null; folderId?: string; parentId?: string | null }
            | undefined;

        const overFolderId: string | null | undefined =
            overData?.type === "lorebook-folder" ? overData.targetFolderId
            : overData?.type === "lorebook-folder-sort" ? overData.folderId
            : undefined;

        if (activeData?.type === "lorebook-entry" && overFolderId !== undefined) {
            updateLorebookMutation.mutate({ id: activeData.leafId as string, data: { folderId: overFolderId ?? null } });
            return;
        }

        if (activeData?.type === "lorebook-folder-sort" && overFolderId) {
            if (activeData.folderId === overFolderId) return;
            const overFolder = folderProps.folders.find(f => f.id === overFolderId);
            if (!overFolder || overFolder.parentId !== activeData.parentId) return;
            const siblings = folderProps.folders
                .filter(f => f.parentId === activeData.parentId)
                .sort((a, b) => a.order - b.order);
            const oldIndex = siblings.findIndex(f => f.id === activeData.folderId);
            const newIndex = siblings.findIndex(f => f.id === overFolderId);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(siblings, oldIndex, newIndex);
            reorderFoldersMutation.mutate(reordered.map((f, index) => ({ id: f.id, order: index })));
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Header - horizontal with buttons alongside title */}
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-3xl font-bold">{seriesId ? "Series Lorebook" : "Story Lorebook"}</h1>
                    <p className="text-muted-foreground mt-1 text-xs sm:text-base truncate">
                        {seriesId ? "Shared across series" : "Story, global & series entries"}
                    </p>
                </div>
                <div className="flex gap-1 sm:gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline ml-2">Refresh</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onExport}
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        title="Export"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline ml-2">Export</span>
                    </Button>
                    <label
                        htmlFor="import-lorebook"
                        aria-label="Import lorebook entries — JSON, PDF, DOCX, or Markdown"
                        onClick={e => {
                            if (isImportingDocument) e.preventDefault();
                        }}
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            asChild
                            disabled={isImportingDocument}
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        >
                            <div title="Import (JSON, PDF, DOCX, or Markdown)">
                                {isImportingDocument ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline ml-2">{isImportingDocument ? "Analyzing..." : "Import"}</span>
                            </div>
                        </Button>
                    </label>
                    <input
                        id="import-lorebook"
                        type="file"
                        accept=".json,.pdf,.docx,.md,.txt"
                        className="hidden"
                        disabled={isImportingDocument}
                        onChange={onImport}
                    />
                    <MultiEntryImportDialog storyId={storyId} seriesId={seriesId} onCreated={onRefresh} />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onOpenSecrets}
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        title="Secrets — story-wide hidden/revealed Codex secrets"
                    >
                        <Lock className="w-4 h-4" />
                        <span className="hidden sm:inline ml-2">Secrets</span>
                    </Button>
                    <Button
                        variant="gradient"
                        size="icon"
                        className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                        onClick={onNewEntry}
                        title="New Entry"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline ml-2">New Entry</span>
                    </Button>
                </div>
            </div>

            <Separator />

            {/* Mobile: dropdown selector */}
            <div className="sm:hidden">
                <Select value={selectedCategory} onValueChange={v => onCategoryChange(v as LorebookCategory)}>
                    <SelectTrigger className="w-full">
                        <SelectValue>
                            {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} (
                            {categoryCounts[selectedCategory] || 0})
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>
                                {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat] || 0})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Desktop: tabs */}
            <Tabs
                value={selectedCategory}
                onValueChange={v => onCategoryChange(v as LorebookCategory)}
                className="w-full hidden sm:block"
            >
                <TabsList className="w-full justify-start bg-muted p-1 border border-border">
                    {CATEGORIES.map(cat => (
                        <TabsTrigger
                            key={cat}
                            value={cat}
                            className="text-sm data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-primary"
                        >
                            {cat.charAt(0).toUpperCase() + cat.slice(1)} ({categoryCounts[cat] || 0})
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Entry list - shared between mobile and desktop */}
            <div className="mt-4 sm:mt-6">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : (
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                        <div className="flex gap-4">
                            {folderProps.scope && (
                                <LorebookFolderSidebar
                                    level={folderProps.scope.level}
                                    scopeId={folderProps.scope.scopeId}
                                    category={selectedCategory}
                                    selectedFolderId={folderProps.selectedFolderId}
                                    onSelectFolder={folderProps.onFolderChange}
                                    includeDescendants={folderProps.includeDescendants}
                                    onIncludeDescendantsChange={folderProps.onIncludeDescendantsChange}
                                />
                            )}
                            <div className="min-w-0 flex-1">
                                {entriesByCategory.length > 0 ? (
                                    <LorebookEntryList
                                        entries={entriesByCategory}
                                        editable={true}
                                        showLevel={true}
                                        onOpenEntry={onOpenEntry}
                                        folders={folderProps.folders}
                                        crossCategoryEntries={allEntries}
                                    />
                                ) : (
                                    <div className="text-center text-muted-foreground py-12">No {selectedCategory} entries yet</div>
                                )}
                            </div>
                        </div>
                    </DndContext>
                )}
            </div>
        </div>
    );
}
