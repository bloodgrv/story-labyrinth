import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { brainstormApi } from "@/services/api/client";

// P0.4 B2/B4 — the fixed 5-slot known/unknown setup checklist.
export const useBrainstormSlotsQuery = (storyId: string | undefined) =>
    useQuery({
        queryKey: ["brainstorm-slots", storyId],
        queryFn: () => brainstormApi.getSlots(storyId as string).then(r => r.slots),
        enabled: !!storyId
    });

export const useSetSlotStatusMutation = (storyId: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ slotKey, status }: { slotKey: string; status: "known" | "unknown" }) =>
            brainstormApi.setSlotStatus(storyId as string, slotKey, status),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brainstorm-slots", storyId] }),
        onError: (error: Error) => toast.error(error.message || "Failed to update slot")
    });
};
