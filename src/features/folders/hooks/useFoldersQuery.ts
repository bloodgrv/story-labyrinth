import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { foldersApi } from "@/services/api/client";
import type { CreateFolderInput } from "@/types/folders";

// Query keys mirror lorebookKeys/chatKeys' shape (see useLorebookQuery.ts, useChatQuery.ts) —
// scoped by kind+scopeId+category|chatType so a lorebook folder change never invalidates a
// completely unrelated chat folder list, and vice versa.
export const folderKeys = {
    all: ["folders"] as const,
    list: (kind: "lorebook" | "chat" | "notes", scopeId: string, discriminator?: string) =>
        [...folderKeys.all, kind, scopeId, discriminator ?? "all"] as const
};

export const useFoldersQuery = (params: { kind: "lorebook" | "chat" | "notes"; scopeId: string; category?: string; chatType?: string }) =>
    useQuery({
        queryKey: folderKeys.list(params.kind, params.scopeId, params.category ?? params.chatType),
        queryFn: () => foldersApi.list(params),
        enabled: !!params.scopeId
    });

export const useCreateFolderMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateFolderInput) => foldersApi.create(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: folderKeys.all }),
        onError: (error: Error) => toast.error(error.message || "Failed to create folder")
    });
};

export const useRenameFolderMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => foldersApi.rename(id, name),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: folderKeys.all }),
        onError: (error: Error) => toast.error(error.message || "Failed to rename folder")
    });
};

export const useMoveFolderMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { parentId?: string | null; order?: number } }) => foldersApi.move(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: folderKeys.all }),
        onError: (error: Error) => toast.error(error.message || "Failed to move folder")
    });
};

export const useDeleteFolderMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => foldersApi.delete(id),
        onSuccess: () => {
            // A folder delete reparents leaves (server-side) — the lorebook/chat/notes lists
            // holding those leaves' folderId are stale too, not just the folder tree itself.
            queryClient.invalidateQueries({ queryKey: folderKeys.all });
            queryClient.invalidateQueries({ queryKey: ["lorebook"] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["notes"] });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete folder")
    });
};
