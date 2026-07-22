import { FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface FolderContextMenuProps {
    onNewSubfolder: () => void;
    onRename: () => void;
    onMoveTo: () => void;
    onDelete: () => void;
    // Depth-3 folders can't take a subfolder — disable rather than hide, so the limit is visible.
    canNestDeeper: boolean;
}

// Kebab menu for a folder row — New subfolder / Rename / Move to… / Delete. Shared by the
// Lorebook folder sidebar and the ChatList folder tree (B9, docs/Folders_Org_Design.md decision
// #8: existing dropdown-menu.tsx, no dedicated tree/context-menu primitive in this codebase).
export function FolderContextMenu({ onNewSubfolder, onRename, onMoveTo, onDelete, canNestDeeper }: FolderContextMenuProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={e => e.stopPropagation()}
                    title="Folder actions"
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={onNewSubfolder} disabled={!canNestDeeper}>
                    <FolderPlus className="h-4 w-4" />
                    New subfolder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRename}>
                    <Pencil className="h-4 w-4" />
                    Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveTo}>
                    <FolderPlus className="h-4 w-4 rotate-90" />
                    Move to…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
