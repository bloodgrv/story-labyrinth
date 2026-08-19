import { attemptPromise } from "@jfdi/attempt";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { SearchFilter } from "@/components/ui/SearchFilter";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DraggableLeaf } from "@/features/folders/components/DraggableLeaf";
import { getFolderPath } from "@/features/folders/lib/folderTree";
import { useLorebookBrowseView } from "@/lib/useLorebookBrowseView";
import type { OrgFolder } from "@/types/folders";
import type { LorebookEntry } from "@/types/story";
import { logger } from "@/utils/logger";
import { useDeleteLorebookMutation, useUpdateLorebookMutation } from "../hooks/useLorebookQuery";
import { LorebookEntryCard } from "./LorebookEntryCard";
import { LorebookEntryRow } from "./LorebookEntryRow";

interface LorebookEntryListProps {
    entries: LorebookEntry[];
    editable?: boolean;
    showLevel?: boolean;
    editableFilter?: (entry: LorebookEntry) => boolean;
    // Clicking a card opens the entry here instead of an inline edit dialog — LorebookPage
    // opens it as a tab; other callers can pass whatever they like.
    onOpenEntry: (entry: LorebookEntry) => void;
    // Folder tree for this scope+category (B9, docs/Folders_Org_Design.md) — omitted entirely by
    // callers that don't use folders, in which case entries just render without a crumb or drag
    // handle, unchanged from pre-B9 behavior.
    folders?: OrgFolder[];
    // Full, unfiltered-by-category entry list for this scope (LorebookPage's own `entries`, before
    // its category filter) — when provided, an "All categories" toggle appears next to the search
    // box so a large lorebook can be searched without first guessing which category tab an entry
    // is in. Omitted entirely by callers that don't have that superset handy, in which case the
    // toggle just doesn't render (unchanged pre-existing behavior).
    crossCategoryEntries?: LorebookEntry[];
}

type SortOption = "name" | "category" | "importance" | "created";

export const lorebookMatchesSearch = (entry: LorebookEntry, term: string) =>
    [entry.name, entry.description, ...(entry.tags || [])].some(field => field?.toLowerCase().includes(term));

export function LorebookEntryList({
    entries: allEntries,
    editable = true,
    showLevel = false,
    editableFilter,
    onOpenEntry,
    folders,
    crossCategoryEntries
}: LorebookEntryListProps) {
    const deleteMutation = useDeleteLorebookMutation();
    const updateMutation = useUpdateLorebookMutation();
    const [sortBy, setSortBy] = useState<SortOption>("name");
    const [deletingEntry, setDeletingEntry] = useState<LorebookEntry | null>(null);
    const [showDisabled, setShowDisabled] = useState(false);
    const [searchAllCategories, setSearchAllCategories] = useState(false);
    const [view, setView] = useLorebookBrowseView(allEntries.length);

    const visibleEntries = useMemo(
        () => allEntries.filter(entry => showDisabled || !entry.isDisabled),
        [allEntries, showDisabled]
    );

    const searchScopeEntries = useMemo(() => {
        if (!searchAllCategories || !crossCategoryEntries) return visibleEntries;
        return crossCategoryEntries.filter(entry => showDisabled || !entry.isDisabled);
    }, [searchAllCategories, crossCategoryEntries, visibleEntries, showDisabled]);

    const sortEntries = (entries: LorebookEntry[]) =>
        [...entries].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return a.name.localeCompare(b.name);
                case "category":
                    return a.category.localeCompare(b.category);
                case "importance":
                    return (a.metadata?.importance || "").localeCompare(b.metadata?.importance || "");
                case "created":
                    return b.createdAt.getTime() - a.createdAt.getTime();
                default:
                    return 0;
            }
        });

    const handleDelete = async (entry: LorebookEntry) => {
        const [error] = await attemptPromise(async () => {
            await deleteMutation.mutateAsync(entry.id);
        });
        if (error) {
            logger.error("Failed to delete entry:", error);
            return;
        }
        setDeletingEntry(null);
    };

    const toggleDisabled = async (entry: LorebookEntry) => {
        const [error] = await attemptPromise(async () => {
            await updateMutation.mutateAsync({
                id: entry.id,
                data: { isDisabled: !entry.isDisabled }
            });
        });
        if (error) logger.error("Failed to update entry:", error);
    };

    return (
        <SearchFilter items={searchScopeEntries} predicate={lorebookMatchesSearch} placeholder="Search entries...">
            {({ filteredItems, searchInput }) => {
                const sortedEntries = sortEntries(filteredItems);
                return (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            {searchInput}
                            <div className="flex gap-2 items-center">
                                {crossCategoryEntries && (
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="search-all-categories"
                                            checked={searchAllCategories}
                                            onCheckedChange={setSearchAllCategories}
                                        />
                                        <Label htmlFor="search-all-categories" className="font-medium">
                                            All categories
                                        </Label>
                                    </div>
                                )}
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="show-disabled"
                                        checked={showDisabled}
                                        onCheckedChange={setShowDisabled}
                                    />
                                    <Label htmlFor="show-disabled" className="font-medium">
                                        Show Disabled
                                    </Label>
                                </div>
                                <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                                    <SelectTrigger className="w-[150px] border-2 border-border">
                                        <SelectValue placeholder="Sort by..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="name">Name</SelectItem>
                                        <SelectItem value="category">Category</SelectItem>
                                        <SelectItem value="importance">Importance</SelectItem>
                                        <SelectItem value="created">Created Date</SelectItem>
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center rounded-md border border-border p-0.5">
                                    <Button
                                        variant={view === "cards" ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setView("cards")}
                                        title="Card view"
                                    >
                                        <LayoutGrid className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant={view === "list" ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setView("list")}
                                        title="List view"
                                    >
                                        <ListIcon className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {sortedEntries.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                {allEntries.length === 0
                                    ? "No entries yet. Create your first entry!"
                                    : "No entries match your search criteria."}
                            </div>
                        )}

                        {view === "list" ? (
                            <div className="flex flex-col gap-1.5">
                                {sortedEntries.map(entry => {
                                    const isEntryEditable = editableFilter ? editableFilter(entry) : editable;
                                    return (
                                        <DraggableLeaf key={entry.id} id={entry.id} data={{ type: "lorebook-entry", leafId: entry.id }}>
                                            <LorebookEntryRow
                                                entry={entry}
                                                showLevel={showLevel}
                                                isEditable={isEntryEditable}
                                                onOpen={() => onOpenEntry(entry)}
                                                onToggleDisabled={() => toggleDisabled(entry)}
                                                onDelete={() => setDeletingEntry(entry)}
                                                folderPath={folders ? getFolderPath(folders, entry.folderId) : undefined}
                                                showCategory={searchAllCategories}
                                            />
                                        </DraggableLeaf>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {sortedEntries.map(entry => {
                                    const isEntryEditable = editableFilter ? editableFilter(entry) : editable;
                                    return (
                                        <DraggableLeaf key={entry.id} id={entry.id} data={{ type: "lorebook-entry", leafId: entry.id }}>
                                            <LorebookEntryCard
                                                entry={entry}
                                                showLevel={showLevel}
                                                isEditable={isEntryEditable}
                                                onOpen={() => onOpenEntry(entry)}
                                                onToggleDisabled={() => toggleDisabled(entry)}
                                                onDelete={() => setDeletingEntry(entry)}
                                                folderPath={folders ? getFolderPath(folders, entry.folderId) : undefined}
                                            />
                                        </DraggableLeaf>
                                    );
                                })}
                            </div>
                        )}

                        <AlertDialog open={!!deletingEntry} onOpenChange={() => setDeletingEntry(null)}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Move "{deletingEntry?.name}" to Trash? You can restore it within 14 days.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => deletingEntry && handleDelete(deletingEntry)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                );
            }}
        </SearchFilter>
    );
}
