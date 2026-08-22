import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { updateApi } from "@/services/api/client";

export const updateKeys = {
    mode: ["update", "mode"] as const,
    check: ["update", "check"] as const,
    status: ["update", "status"] as const
};

// Cheap, unauthenticated-feeling check (still requireOwner server-side) — safe to run on every
// Settings page load so the "Updates" tab only ever appears for a portable install.
export const useUpdateModeQuery = () =>
    useQuery({ queryKey: updateKeys.mode, queryFn: updateApi.mode, staleTime: Infinity });

// Manual-trigger by default (enabled: false) — this project's standing doctrine is "check/
// propose on request, never silently on a timer" (see e.g. distill_memory, graph_suggest_edges).
// A 1h staleTime keeps a repeat "Check for updates" click cheap without re-hitting GitHub's API.
export const useUpdateCheckQuery = (enabled: boolean) =>
    useQuery({ queryKey: updateKeys.check, queryFn: updateApi.check, enabled, staleTime: 60 * 60 * 1000 });

// Only polled while an update is actually in flight (UpdatesSettingsCard controls `enabled`) —
// this is the one channel the still-running old server has into the detached updater process's
// progress (see scripts/portable-updater/lib/statusFile.mjs).
export const useUpdateStatusQuery = (enabled: boolean) =>
    useQuery({ queryKey: updateKeys.status, queryFn: updateApi.status, enabled, refetchInterval: enabled ? 2000 : false });

export const useStartUpdateMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: updateApi.start,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: updateKeys.status });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to start update")
    });
};
