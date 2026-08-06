import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { chatsApi } from "@/services/api/client";
import type { ChatType, WorldBuildingTemplateSlug } from "@/types/worldbuilding";

const chatKeys = {
    byStory: (storyId: string, type?: ChatType) => ["chats", "story", storyId, type ?? "all"] as const,
    global: (type: ChatType) => ["chats", "global", type] as const,
    archived: ["chats", "archived"] as const
};

export const useChatsByStoryQuery = (storyId: string, type?: ChatType) =>
    useQuery({
        queryKey: chatKeys.byStory(storyId, type),
        queryFn: () => chatsApi.getByStory(storyId, type),
        enabled: !!storyId
    });

export const useGlobalChatsQuery = (type: ChatType) =>
    useQuery({
        queryKey: chatKeys.global(type),
        queryFn: () => chatsApi.getGlobalList(type)
    });

export const useArchivedChatsQuery = () =>
    useQuery({
        queryKey: chatKeys.archived,
        queryFn: () => chatsApi.getArchived()
    });

export const useChatTemplatesQuery = () =>
    useQuery({
        queryKey: ["chats", "templates"],
        queryFn: chatsApi.getTemplates,
        staleTime: Infinity
    });

export const useCreateChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: {
            storyId: string;
            chatType?: ChatType;
            templateSlug?: WorldBuildingTemplateSlug;
            title?: string;
            anchorEntryId?: string | null;
            anchorChapterId?: string | null;
        }) => chatsApi.create(data),
        onSuccess: chat => {
            // Invalidate the shorter ["chats","story",storyId] prefix, not
            // chatKeys.byStory(storyId) (== [..., "all"]) — React Query's invalidateQueries only
            // matches queries whose key STARTS WITH the given key, so invalidating the
            // type-suffixed "all" key never touched any type-specific list (["chats","story",
            // storyId,"editor"] etc.) at all, meaning ChatList never picked up a chat the moment
            // after it was created. The 3-element prefix matches every typed list for this story.
            queryClient.invalidateQueries({ queryKey: ["chats", "story", chat.storyId ?? ""] });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to create chat")
    });
};

export const useUpdateChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            data
        }: {
            id: string;
            data: {
                messages?: unknown[];
                title?: string;
                lastUsedPromptId?: string | null;
                lastUsedModelId?: string | null;
                folderId?: string | null; // B9, docs/Folders_Org_Design.md — null unfiles
            };
        }) => chatsApi.update(id, data),
        onSuccess: chat => {
            // Same prefix-invalidation fix as useCreateChatMutation above — chatKeys.byStory(storyId)
            // alone (the type-suffixed "all" key) never matched any type-specific ChatList query.
            if (chat.storyId) queryClient.invalidateQueries({ queryKey: ["chats", "story", chat.storyId] });
            // Global chats (storyId null, e.g. Research's Global rail) aren't covered by the
            // story-scoped key above — invalidate their own list key instead.
            else if (chat.chatType) queryClient.invalidateQueries({ queryKey: chatKeys.global(chat.chatType) });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to update chat")
    });
};

export const useCreateGlobalChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { chatType: ChatType; title: string }) => chatsApi.createGlobal(data),
        onSuccess: chat => {
            queryClient.invalidateQueries({ queryKey: chatKeys.global(chat.chatType as ChatType) });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to create chat")
    });
};

// Archive/unarchive both hide-from/restore-to whichever rail (story or global) a chat belongs to
// — invalidate broadly ("chats") rather than trying to know which specific list key it was in.
export const useArchiveChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => chatsApi.archive(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
        onError: (error: Error) => toast.error(error.message || "Failed to archive chat")
    });
};

export const useUnarchiveChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => chatsApi.unarchive(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
        onError: (error: Error) => toast.error(error.message || "Failed to restore chat")
    });
};

export const useDeleteChatMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => chatsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete chat")
    });
};
