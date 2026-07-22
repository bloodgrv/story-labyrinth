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
import { FolderNameDialog } from "@/features/folders/components/FolderNameDialog";
import { MoveToFolderDialog } from "@/features/folders/components/MoveToFolderDialog";
import {
    useCreateFolderMutation,
    useDeleteFolderMutation,
    useMoveFolderMutation,
    useRenameFolderMutation
} from "@/features/folders/hooks/useFoldersQuery";
import type { OrgFolder } from "@/types/folders";
import type { ChatType } from "@/types/worldbuilding";

interface ChatFolderDialogsProps {
    storyId: string;
    chatType: ChatType;
    folders: OrgFolder[];
    creatingUnder: string | null | undefined; // undefined = closed
    onCreatingUnderChange: (value: string | null | undefined) => void;
    renamingId: string | null;
    onRenamingIdChange: (value: string | null) => void;
    movingId: string | null;
    onMovingIdChange: (value: string | null) => void;
    deletingId: string | null;
    onDeletingIdChange: (value: string | null) => void;
}

// The four folder CRUD dialogs (New/subfolder, Rename, Move to…, Delete-confirm) for ChatList's
// folder tree — extracted out of ChatList.tsx to keep that file under the project's max-lines
// limit (B9, docs/Folders_Org_Design.md F3). Mirrors LorebookFolderSidebar.tsx's own dialog set.
export function ChatFolderDialogs({
    storyId,
    chatType,
    folders,
    creatingUnder,
    onCreatingUnderChange,
    renamingId,
    onRenamingIdChange,
    movingId,
    onMovingIdChange,
    deletingId,
    onDeletingIdChange
}: ChatFolderDialogsProps) {
    const createFolderMutation = useCreateFolderMutation();
    const renameFolderMutation = useRenameFolderMutation();
    const moveFolderMutation = useMoveFolderMutation();
    const deleteFolderMutation = useDeleteFolderMutation();

    const renamingFolder = folders.find(f => f.id === renamingId);
    const movingFolder = folders.find(f => f.id === movingId);
    const deletingFolder = folders.find(f => f.id === deletingId);

    return (
        <>
            <FolderNameDialog
                open={creatingUnder !== undefined}
                onOpenChange={open => !open && onCreatingUnderChange(undefined)}
                title={creatingUnder ? "New subfolder" : "New folder"}
                onSubmit={name => {
                    createFolderMutation.mutate(
                        { kind: "chat", scopeId: storyId, chatType, parentId: creatingUnder ?? null, name },
                        { onSuccess: () => onCreatingUnderChange(undefined) }
                    );
                }}
            />

            <FolderNameDialog
                open={!!renamingFolder}
                onOpenChange={open => !open && onRenamingIdChange(null)}
                title="Rename folder"
                initialValue={renamingFolder?.name}
                onSubmit={name => {
                    if (!renamingId) return;
                    renameFolderMutation.mutate({ id: renamingId, name }, { onSuccess: () => onRenamingIdChange(null) });
                }}
            />

            {movingId && (
                <MoveToFolderDialog
                    open
                    onOpenChange={open => !open && onMovingIdChange(null)}
                    folders={folders}
                    excludeId={movingId}
                    currentFolderId={movingFolder?.parentId ?? null}
                    title={`Move "${movingFolder?.name ?? ""}" to…`}
                    onSelect={parentId => moveFolderMutation.mutate({ id: movingId, data: { parentId } })}
                />
            )}

            <AlertDialog open={!!deletingFolder} onOpenChange={open => !open && onDeletingIdChange(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{deletingFolder?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Subfolders and chats inside move up to its parent (or become Unfiled). Nothing is deleted except the
                            folder itself.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!deletingId) return;
                                deleteFolderMutation.mutate(deletingId, { onSuccess: () => onDeletingIdChange(null) });
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
