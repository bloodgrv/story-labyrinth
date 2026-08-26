import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { authApi } from "@/services/api/client";

const STATUS_KEY = ["auth", "status"] as const;

export const useAuthStatus = () =>
    useQuery({
        queryKey: STATUS_KEY,
        queryFn: authApi.getStatus,
        staleTime: 0,
        retry: false
    });

export const useAuthMutations = () => {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: STATUS_KEY });

    const register = useMutation({
        mutationFn: ({ username, password }: { username: string; password: string }) => authApi.register(username, password),
        onSuccess: invalidate
    });

    const login = useMutation({
        mutationFn: ({ username, password }: { username: string; password: string }) => authApi.login(username, password),
        onSuccess: invalidate
    });

    const logout = useMutation({
        mutationFn: authApi.logout,
        onSuccess: invalidate
    });

    return { register, login, logout };
};

// First-Start Tour (T11) — Skip/Finish write completed=true; Replay never writes false back
// (auto-start must never re-arm from a manual replay, per the design's own persistence lock).
export const useSetOnboardingTourCompletedMutation = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (completed: boolean) => authApi.setOnboardingTourCompleted(completed),
        onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY })
    });
};

// Remote Access — RF3 sidebar Remote toggle (docs/Remote_Access_Funnel_Design.md §5b).
export const useSetRemoteSessionMutation = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (enabled: boolean) => authApi.setRemoteSession(enabled),
        onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
        onError: (error: Error) => toast.error(error.message || "Failed to update remote session setting")
    });
};
