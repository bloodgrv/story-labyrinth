import type { LorebookEntry } from "@/types/story";
import { getDescendantFolderIds } from "../lib/folderTree";
import { useFoldersQuery } from "./useFoldersQuery";

// Resolves the folder scope for the current Lorebook Browse context, fetches its folder tree, and
// narrows a category's entries down to a selected folder (+ descendants by default). Extracted out
// of LorebookPage.tsx to keep that file under the project's max-lines limit — see
// docs/Folders_Org_Design.md (B9, F2).
export function useLorebookFolderFilter(params: {
    storyId?: string;
    seriesId?: string;
    entriesByCategoryRaw: LorebookEntry[];
    selectedCategory: string;
    selectedFolderId: string | null;
    includeDescendants: boolean;
}) {
    // Lorebook folders scope like an entry itself (level/scopeId), not a separate storyId/seriesId
    // split — lorebookEntries doesn't have one either (see server/db/schema.ts). Global entries
    // (no scope at all) never get a folder tree — folderScope stays undefined for them.
    const folderScope = params.storyId
        ? ({ level: "story", scopeId: params.storyId } as const)
        : params.seriesId
          ? ({ level: "series", scopeId: params.seriesId } as const)
          : undefined;

    const { data: folders = [] } = useFoldersQuery(
        folderScope
            ? { kind: "lorebook", scopeId: folderScope.scopeId, category: params.selectedCategory }
            : { kind: "lorebook", scopeId: "" }
    );

    const descendantFolderIds = params.selectedFolderId ? getDescendantFolderIds(folders, params.selectedFolderId) : null;
    const entriesByCategory = !params.selectedFolderId
        ? params.entriesByCategoryRaw
        : params.entriesByCategoryRaw.filter(e =>
              params.includeDescendants
                  ? !!e.folderId && descendantFolderIds?.has(e.folderId)
                  : e.folderId === params.selectedFolderId
          );

    return { folderScope, folders, entriesByCategory };
}
