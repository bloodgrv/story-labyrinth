import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FolderTreeNode } from "@/types/folders";
import { FolderContextMenu } from "./FolderContextMenu";
import { FolderDropZone } from "./FolderDropZone";

interface LorebookFolderTreeRowProps {
    node: FolderTreeNode;
    depth: number;
    selectedFolderId: string | null;
    onSelect: (folderId: string) => void;
    onNewSubfolder: (parentId: string) => void;
    onRename: (folderId: string) => void;
    onMoveTo: (folderId: string) => void;
    onDelete: (folderId: string) => void;
}

const MAX_DEPTH = 3;

export function LorebookFolderTreeRow({
    node,
    depth,
    selectedFolderId,
    onSelect,
    onNewSubfolder,
    onRename,
    onMoveTo,
    onDelete
}: LorebookFolderTreeRowProps) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children.length > 0;

    return (
        <div>
            <FolderDropZone id={node.id} data={{ type: "lorebook-folder", targetFolderId: node.id }}>
                <div
                    className={cn(
                        "group flex items-center gap-1 rounded-md py-1 pr-1 cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        selectedFolderId === node.id && "bg-muted"
                    )}
                    style={{ paddingLeft: `${depth * 16 + 4}px` }}
                    onClick={() => onSelect(node.id)}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect(node.id);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                >
                    <button
                        type="button"
                        className={cn("shrink-0 p-0.5", !hasChildren && "invisible")}
                        onClick={e => {
                            e.stopPropagation();
                            setExpanded(prev => !prev);
                        }}
                    >
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{node.name}</span>
                    <div className="opacity-0 group-hover:opacity-100">
                        <FolderContextMenu
                            canNestDeeper={depth + 1 < MAX_DEPTH}
                            onNewSubfolder={() => onNewSubfolder(node.id)}
                            onRename={() => onRename(node.id)}
                            onMoveTo={() => onMoveTo(node.id)}
                            onDelete={() => onDelete(node.id)}
                        />
                    </div>
                </div>
            </FolderDropZone>
            {expanded && hasChildren && (
                <div>
                    {node.children.map(child => (
                        <LorebookFolderTreeRow
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedFolderId={selectedFolderId}
                            onSelect={onSelect}
                            onNewSubfolder={onNewSubfolder}
                            onRename={onRename}
                            onMoveTo={onMoveTo}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
