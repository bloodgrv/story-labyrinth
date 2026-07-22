import { Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FolderTreeNode, OrgFolder } from "@/types/folders";
import { buildFolderTree, getDescendantFolderIds } from "../lib/folderTree";

interface MoveToFolderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: OrgFolder[];
    // Excluded from the pick list along with its own descendants — set when moving a folder
    // itself (a folder can't become its own descendant's child).
    excludeId?: string;
    currentFolderId: string | null;
    onSelect: (folderId: string | null) => void;
    title?: string;
}

// "Move to…" picker — a small indented tree of buttons, not a full DnD requirement. Shared by the
// Lorebook folder sidebar and the ChatList folder tree (B9, one folder engine, thin UIs).
export function MoveToFolderDialog({ open, onOpenChange, folders, excludeId, currentFolderId, onSelect, title = "Move to folder" }: MoveToFolderDialogProps) {
    const excludedIds = excludeId ? getDescendantFolderIds(folders, excludeId) : new Set<string>();
    const pickableFolders = folders.filter(f => !excludedIds.has(f.id));
    const tree = buildFolderTree(pickableFolders);

    const pick = (folderId: string | null) => {
        onSelect(folderId);
        onOpenChange(false);
    };

    const renderNode = (node: FolderTreeNode, depth: number) => (
        <div key={node.id}>
            <Button
                variant="ghost"
                className="w-full justify-start gap-2 font-normal"
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => pick(node.id)}
            >
                {node.id === currentFolderId ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                <span className="truncate">{node.name}</span>
            </Button>
            {node.children.map(child => renderNode(child, depth + 1))}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-80">
                    <Button variant="ghost" className="w-full justify-start gap-2 pl-3 font-normal" onClick={() => pick(null)}>
                        {currentFolderId === null ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                        Unfiled
                    </Button>
                    {tree.map(node => renderNode(node, 0))}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
