import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ttsApi } from "@/services/api/client";
import type { TtsProvider } from "@/types/ttsSettings";

export const storyTtsVoiceKeys = {
    all: ["tts", "story-voice"] as const,
    byStory: (storyId: string) => [...storyTtsVoiceKeys.all, storyId] as const
};

export const useStoryTtsVoiceQuery = (storyId: string) =>
    useQuery({
        queryKey: storyTtsVoiceKeys.byStory(storyId),
        queryFn: () => ttsApi.getStoryVoice(storyId),
        enabled: !!storyId
    });

export const useSetStoryTtsVoiceMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { provider: TtsProvider; voiceId: string }) => ttsApi.setStoryVoice(storyId, data),
        onSuccess: updated => {
            queryClient.setQueryData(storyTtsVoiceKeys.byStory(storyId), updated);
            toast.success("Project voice updated");
        },
        onError: () => {
            toast.error("Failed to update project voice");
        }
    });
};

export const useClearStoryTtsVoiceMutation = (storyId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => ttsApi.clearStoryVoice(storyId),
        onSuccess: () => {
            queryClient.setQueryData(storyTtsVoiceKeys.byStory(storyId), null);
            toast.success("Using global default voice");
        },
        onError: () => {
            toast.error("Failed to reset project voice");
        }
    });
};
