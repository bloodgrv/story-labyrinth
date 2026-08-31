import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { aiSettingsKeys } from "@/features/ai/hooks/useAISettingsQuery";
import { aiApi, chaptersApi, chatsApi, featureEndpointsApi, storiesApi } from "@/services/api/client";
import type { WorldBuildingTemplateSlug } from "@/types/worldbuilding";

// ── Query keys ─────────────────────────────────────────────────────────────────

const keys = {
    story: (id: string) => ["stories", "detail", id] as const,
    chapters: (storyId: string) => ["chapters", "byStory", storyId] as const,
    wbChats: (storyId: string) => ["chats", "worldbuilding", storyId] as const,
    templates: () => ["chats", "templates"] as const,
    aiSettings: () => ["aiSettings"] as const
};

// ── Hooks ──────────────────────────────────────────────────────────────────────

export const useDashboardData = (storyId: string) => {
    const story = useQuery({
        queryKey: keys.story(storyId),
        queryFn: () => storiesApi.getById(storyId),
        enabled: !!storyId
    });

    const chapters = useQuery({
        queryKey: keys.chapters(storyId),
        queryFn: () => chaptersApi.getByStory(storyId),
        enabled: !!storyId
    });

    const wbChats = useQuery({
        queryKey: keys.wbChats(storyId),
        queryFn: () => chatsApi.getByStory(storyId, "worldbuilding"),
        enabled: !!storyId
    });

    const aiSettings = useQuery({
        queryKey: keys.aiSettings(),
        queryFn: () => aiApi.getSettings()
    });

    const featureEndpoints = useQuery({
        queryKey: aiSettingsKeys.featureEndpoints(),
        queryFn: () => featureEndpointsApi.get()
    });

    const sortedChapters = [...(chapters.data ?? [])].sort((a, b) => a.order - b.order);
    const lastChapter = sortedChapters[sortedChapters.length - 1] ?? null;

    return {
        story: story.data,
        isLoadingStory: story.isLoading,
        isStoryError: story.isError,
        storyError: story.error as Error | null,
        chapters: sortedChapters,
        isLoadingChapters: chapters.isLoading,
        isChaptersError: chapters.isError,
        lastChapter,
        wbChats: wbChats.data ?? [],
        isLoadingWbChats: wbChats.isLoading,
        isWbChatsError: wbChats.isError,
        aiSettings: aiSettings.data,
        featureEndpoints: featureEndpoints.data ?? {}
    };
};

export const useWbChatTemplates = () =>
    useQuery({
        queryKey: keys.templates(),
        queryFn: () => chatsApi.getTemplates()
    });

export const useCreateWbChatMutation = (storyId: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: { templateSlug?: WorldBuildingTemplateSlug; title?: string; titleIsCustom?: boolean }) =>
            chatsApi.create({
                storyId,
                chatType: "worldbuilding",
                templateSlug: params.templateSlug,
                title: params.title,
                titleIsCustom: params.titleIsCustom
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: keys.wbChats(storyId) });
            toast.success("World-building chat created");
        },
        onError: (err: Error) => toast.error(`Failed to create chat: ${err.message}`)
    });
};
