import { useMutation, useQueryClient } from "@tanstack/react-query";
import { beatsApi } from "@/services/api/client";
import { beatsKeys } from "./useBeatsQuery";

// Deliberately has no built-in toast/onError handling: the manually-triggered "Suggest Beats"
// button (ConcreteBeatsPanel) and the silent background auto-tagging trigger
// (SaveChapterContentPlugin) want very different feedback — the manual one always reports
// success/failure, the background one should stay quiet on failure and only nudge the user
// when it actually finds something. Each call site supplies its own onSuccess/onError.
export const useDetectBeatsMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (storyId: string) => beatsApi.detect(chapterId, storyId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
        }
    });
};
