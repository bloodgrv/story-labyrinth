import type { FolderTreeNode, OrgFolder } from "@/types/folders";

// Builds a nested tree from the flat list the API returns, sorted by each folder's own `order`
// among its siblings. Root folders (parentId === null) come back as the top-level array.
export function buildFolderTree(folders: OrgFolder[]): FolderTreeNode[] {
    const byParent = new Map<string | null, OrgFolder[]>();
    for (const folder of folders) {
        const key = folder.parentId;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)?.push(folder);
    }
    for (const siblings of byParent.values()) siblings.sort((a, b) => a.order - b.order);

    const attachChildren = (folder: OrgFolder): FolderTreeNode => ({
        ...folder,
        children: (byParent.get(folder.id) ?? []).map(attachChildren)
    });

    return (byParent.get(null) ?? []).map(attachChildren);
}

// A folder's own id plus every descendant's id — used for "folder + descendants" filtering
// (the design doc's recommended default when a folder is selected).
export function getDescendantFolderIds(folders: OrgFolder[], folderId: string): Set<string> {
    const byParent = new Map<string | null, string[]>();
    for (const folder of folders) {
        const key = folder.parentId;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)?.push(folder.id);
    }

    const ids = new Set<string>([folderId]);
    const stack = [folderId];
    while (stack.length > 0) {
        const current = stack.pop() as string;
        for (const childId of byParent.get(current) ?? []) {
            if (ids.has(childId)) continue;
            ids.add(childId);
            stack.push(childId);
        }
    }
    return ids;
}

// The chain of folder names from root to `folderId`, e.g. ["Cast", "Antagonists"] — used for the
// path-crumb shown on a row/card when browsing unfiltered (design doc §"Search" default).
export function getFolderPath(folders: OrgFolder[], folderId: string | null | undefined): string[] {
    if (!folderId) return [];
    const byId = new Map(folders.map(f => [f.id, f]));
    const path: string[] = [];
    let currentId: string | null | undefined = folderId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const folder = byId.get(currentId);
        if (!folder) break;
        path.unshift(folder.name);
        currentId = folder.parentId;
    }
    return path;
}
