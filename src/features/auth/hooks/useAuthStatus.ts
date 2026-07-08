import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
