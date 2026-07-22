// Cosmetic org folders (B9, docs/Folders_Org_Design.md) — filing-only, never read by RAG, Codex,
// or agent context. One shared shape for both lorebook and chat folders; `kind` selects which of
// the scope fields below are meaningful.
export interface OrgFolder {
    id: string;
    kind: "lorebook" | "chat";
    level: "series" | "story" | null; // lorebook only
    scopeId: string; // lorebook: seriesId/storyId per level; chat: storyId
    category: string | null; // lorebook only
    chatType: string | null; // chat only
    parentId: string | null; // null = root folder
    name: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateFolderInput {
    kind: "lorebook" | "chat";
    level?: "series" | "story" | null;
    scopeId: string;
    category?: string | null;
    chatType?: string | null;
    parentId?: string | null;
    name: string;
}

export interface FolderTreeNode extends OrgFolder {
    children: FolderTreeNode[];
}
