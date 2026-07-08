import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { beatsApi } from "@/services/api/client";
import type { ConcreteBeat } from "@/types/beats";
import { BEAT_ACCEPTED_EVENT, BEAT_DELETED_EVENT } from "../beatEvents";

export const beatsKeys = {
    all: ["beats"] as const,
    byChapter: (chapterId: string) => [...beatsKeys.all, "chapter", chapterId] as const
};

export const useBeatsQuery = (chapterId: string) =>
    useQuery({
        queryKey: beatsKeys.byChapter(chapterId),
        queryFn: () => beatsApi.getByChapter(chapterId),
        enabled: !!chapterId
    });

export const useCreateBeatMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: Omit<ConcreteBeat, "id" | "createdAt">) => beatsApi.create(data),
        onSuccess: created => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(created.chapterId) });
        },
        onError: () => {
            toast.error("Failed to save beat");
        }
    });
};

export const useDeleteBeatMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => beatsApi.delete(id),
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
            window.dispatchEvent(new CustomEvent(BEAT_DELETED_EVENT, { detail: { beatId: id } }));
            toast.success("Beat removed");
        },
        onError: () => {
            toast.error("Failed to remove beat");
        }
    });
};

export const useUpdateBeatMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<ConcreteBeat> }) => beatsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
        },
        onError: () => {
            toast.error("Failed to update beat");
        }
    });
};

// Confirms an AI suggestion: flips status to "confirmed" and — via the BEAT_ACCEPTED_EVENT
// bridge — asks BeatMarkSyncPlugin to find the beat's text in the live document and wrap it in
// a real BeatMarkNode, the same inline highlight a manually-marked beat gets.
export const useAcceptBeatMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (beat: ConcreteBeat) => beatsApi.update(beat.id, { status: "confirmed" }),
        onSuccess: (_updated, beat) => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
            window.dispatchEvent(
                new CustomEvent(BEAT_ACCEPTED_EVENT, {
                    detail: { beatId: beat.id, text: beat.text, beatType: beat.beatType }
                })
            );
            toast.success("Beat confirmed");
        },
        onError: () => {
            toast.error("Failed to confirm beat");
        }
    });
};

export const useRejectBeatMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => beatsApi.update(id, { status: "rejected" }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
            toast.success("Suggestion rejected");
        },
        onError: () => {
            toast.error("Failed to reject suggestion");
        }
    });
};

export const useRejectAllBeatsMutation = (chapterId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => beatsApi.rejectAll(chapterId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: beatsKeys.byChapter(chapterId) });
            toast.success("All suggestions rejected");
        },
        onError: () => {
            toast.error("Failed to reject suggestions");
        }
    });
};
