import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { chatsApi } from "@/services/api/client";
import type { ChatType, WorldBuildingTemplateSlug } from "@/types/worldbuilding";

const chatKeys = {
    byStory: (storyId: string, type?: ChatType) => ["chats", "story", storyId, type ?? "all"] as const
};

export const useChatsByStoryQuery = (storyId: string, type?: ChatType) =>
    useQuery({
        queryKey: chatKeys.byStory(storyId, type),
        queryFn: () => chatsApi.getByStory(storyId, type),
        enabled: !!storyId
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
            data: { messages?: unknown[]; title?: string; lastUsedPromptId?: string | null; lastUsedModelId?: string | null };
        }) => chatsApi.update(id, data),
        onSuccess: chat => {
            // Same prefix-invalidation fix as useCreateChatMutation above — chatKeys.byStory(storyId)
            // alone (the type-suffixed "all" key) never matched any type-specific ChatList query.
            queryClient.invalidateQueries({ queryKey: ["chats", "story", chat.storyId ?? ""] });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to update chat")
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
