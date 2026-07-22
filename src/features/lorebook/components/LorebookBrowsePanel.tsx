import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Download, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LorebookFolderSidebar } from "@/features/folders/components/LorebookFolderSidebar";
import type { OrgFolder } from "@/types/folders";
import type { LorebookEntry } from "@/types/story";
import { useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { CATEGORIES, type LorebookCategory } from "./form";
import { LorebookEntryList } from "./LorebookEntryList";

interface LorebookBrowsePanelProps {
    seriesId?: string;
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
    folderProps
}: LorebookBrowsePanelProps) {
    const updateLorebookMutation = useUpdateLorebookMutation();

    // Drag an entry (LorebookEntryList's DraggableLeaf) onto a folder row or "Unfiled" (both
    // FolderDropZone in LorebookFolderSidebar) to file it — folder-onto-folder reparenting goes
    // through the "Move to…" dialog instead (B9 plan decision #7), so this only ever sees
    // lorebook-entry drags landing on a lorebook-folder target.
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeData = active.data.current as { type?: string; leafId?: string } | undefined;
        const overData = over.data.current as { type?: string; targetFolderId?: string | null } | undefined;
        if (activeData?.type !== "lorebook-entry" || overData?.type !== "lorebook-folder") return;
        updateLorebookMutation.mutate({ id: activeData.leafId as string, data: { folderId: overData.targetFolderId ?? null } });
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
                    <Button size="icon" className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3" onClick={onNewEntry} title="New Entry">
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
                    <DndContext onDragEnd={handleDragEnd}>
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
