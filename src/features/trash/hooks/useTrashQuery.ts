import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { trashApi } from "@/services/api/client";

const trashKeys = {
    all: ["trash"] as const
};

export const useTrashQuery = () =>
    useQuery({
        queryKey: trashKeys.all,
        queryFn: trashApi.list
    });

// Trash / Restore (14-day soft-delete) — restoring or purging an item can affect basically any
// other feature's own query cache (a restored story reappears in the stories list, a restored
// note reappears in its story's notes list, etc.), and this panel is a Settings-level admin
// surface, not a hot path — so both mutations invalidate broadly rather than trying to enumerate
// every affected query key.
export const useRestoreTrashMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ type, id }: { type: string; id: string }) => trashApi.restore(type, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: trashKeys.all });
            queryClient.invalidateQueries();
            toast.success("Restored");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to restore item")
    });
};

export const usePurgeTrashMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ type, id }: { type: string; id: string }) => trashApi.purge(type, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: trashKeys.all });
            toast.success("Deleted permanently");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to permanently delete item")
    });
};
