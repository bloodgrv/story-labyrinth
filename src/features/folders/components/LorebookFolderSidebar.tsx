import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { LorebookCategory } from "@/features/lorebook/components/form";
import { buildFolderTree, getFolderPath } from "../lib/folderTree";
import {
    useCreateFolderMutation,
    useDeleteFolderMutation,
    useFoldersQuery,
    useMoveFolderMutation,
    useRenameFolderMutation
} from "../hooks/useFoldersQuery";
import { FolderNameDialog } from "./FolderNameDialog";
import { FolderDropZone } from "./FolderDropZone";
import { LorebookFolderTreeRow } from "./LorebookFolderTreeRow";
import { MoveToFolderDialog } from "./MoveToFolderDialog";

interface LorebookFolderSidebarProps {
    level: "series" | "story";
    scopeId: string;
    category: LorebookCategory;
    selectedFolderId: string | null;
    onSelectFolder: (folderId: string | null) => void;
    includeDescendants: boolean;
    onIncludeDescendantsChange: (value: boolean) => void;
}

// Folder tree sidebar for Lorebook Browse (B9, docs/Folders_Org_Design.md F2). Selecting a folder
// filters the main pane (LorebookEntryList) to that folder — see LorebookPage.tsx. DnD filing is
// wired via FolderDropZone (this file's rows) + DraggableLeaf (LorebookEntryList's cards/rows),
// both under a shared DndContext in LorebookBrowsePanel.tsx.
export function LorebookFolderSidebar({
    level,
    scopeId,
    category,
    selectedFolderId,
    onSelectFolder,
    includeDescendants,
    onIncludeDescendantsChange
}: LorebookFolderSidebarProps) {
    const { data: folders = [] } = useFoldersQuery({ kind: "lorebook", scopeId, category });
    const createMutation = useCreateFolderMutation();
    const renameMutation = useRenameFolderMutation();
    const moveMutation = useMoveFolderMutation();
    const deleteMutation = useDeleteFolderMutation();

    const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined); // undefined = closed
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const tree = buildFolderTree(folders);
    const renamingFolder = folders.find(f => f.id === renamingId);
    const deletingFolder = folders.find(f => f.id === deletingId);

    return (
        <div className="w-[220px] shrink-0 border-r border-border pr-2">
            <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Folders</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="New folder" onClick={() => setCreatingUnder(null)}>
                    <FolderPlus className="h-3.5 w-3.5" />
                </Button>
            </div>

            <FolderDropZone id="unfiled" data={{ type: "lorebook-folder", targetFolderId: null }}>
                <div
                    className={cn(
                        "cursor-pointer rounded-md px-2 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        selectedFolderId === null && "bg-muted"
                    )}
                    onClick={() => onSelectFolder(null)}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectFolder(null);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                >
                    Unfiled / All
                </div>
            </FolderDropZone>

            <div className="mt-1">
                <SortableContext items={tree.map(node => `sort:${node.id}`)} strategy={verticalListSortingStrategy}>
                    {tree.map(node => (
                        <LorebookFolderTreeRow
                            key={node.id}
                            node={node}
                            depth={0}
                            selectedFolderId={selectedFolderId}
                            onSelect={onSelectFolder}
                            onNewSubfolder={parentId => setCreatingUnder(parentId)}
                            onRename={setRenamingId}
                            onMoveTo={setMovingId}
                            onDelete={setDeletingId}
                        />
                    ))}
                </SortableContext>
            </div>

            {selectedFolderId && (
                <div className="mt-3 flex items-center gap-2 px-1">
                    <Switch id="folder-descendants" checked={includeDescendants} onCheckedChange={onIncludeDescendantsChange} />
                    <Label htmlFor="folder-descendants" className="text-xs font-normal text-muted-foreground">
                        Include subfolders
                    </Label>
                </div>
            )}

            <FolderNameDialog
                open={creatingUnder !== undefined}
                onOpenChange={open => !open && setCreatingUnder(undefined)}
                title={creatingUnder ? "New subfolder" : "New folder"}
                onSubmit={name => {
                    createMutation.mutate(
                        { kind: "lorebook", level, scopeId, category, parentId: creatingUnder ?? null, name },
                        { onSuccess: () => setCreatingUnder(undefined) }
                    );
                }}
            />

            <FolderNameDialog
                open={!!renamingFolder}
                onOpenChange={open => !open && setRenamingId(null)}
                title="Rename folder"
                initialValue={renamingFolder?.name}
                onSubmit={name => {
                    if (!renamingId) return;
                    renameMutation.mutate({ id: renamingId, name }, { onSuccess: () => setRenamingId(null) });
                }}
            />

            {movingId && (
                <MoveToFolderDialog
                    open
                    onOpenChange={open => !open && setMovingId(null)}
                    folders={folders}
                    excludeId={movingId}
                    currentFolderId={folders.find(f => f.id === movingId)?.parentId ?? null}
                    title={`Move "${folders.find(f => f.id === movingId)?.name ?? ""}" to…`}
                    onSelect={parentId => moveMutation.mutate({ id: movingId, data: { parentId } })}
                />
            )}

            <AlertDialog open={!!deletingFolder} onOpenChange={open => !open && setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{deletingFolder?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deletingFolder && getFolderPath(folders, deletingFolder.id).length > 1
                                ? "Subfolders and entries inside move up to its parent folder."
                                : "Subfolders and entries inside become Unfiled."}{" "}
                            Nothing is deleted except the folder itself.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!deletingId) return;
                                deleteMutation.mutate(deletingId, { onSuccess: () => setDeletingId(null) });
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
