import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { brainstormApi } from "@/services/api/client";
import type { BrainstormChecklistStatus } from "@/types/brainstorm";

// P0.4 B4 — the durable checklist tray. Query key prefix (["brainstorm-checklist", chatId])
// deliberately matches what ChatInterface.tsx invalidates after posting a newly-parsed
// overview-proposal/handoff-packet fence — see its onOverviewProposal/onHandoffPackets handlers.
export const useBrainstormChecklistQuery = (chatId: string | undefined, filter: "active" | "done") =>
    useQuery({
        queryKey: ["brainstorm-checklist", chatId, filter],
        queryFn: () => brainstormApi.listChecklist(chatId as string, filter).then(r => r.items),
        enabled: !!chatId
    });

export const useUpdateChecklistStatusMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: BrainstormChecklistStatus }) => brainstormApi.updateChecklistStatus(id, status),
        onSuccess: item => queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", item.chatId] }),
        onError: (error: Error) => toast.error(error.message || "Failed to update checklist item")
    });
};
