import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { usersApi } from "@/services/api/client";
import type { UserRole } from "@/types/auth";

const usersKeys = {
    all: ["users"] as const
};

export const useUsersQuery = () =>
    useQuery({
        queryKey: usersKeys.all,
        queryFn: usersApi.list
    });

export const useCreateUserMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ username, password, role }: { username: string; password: string; role: UserRole }) =>
            usersApi.create(username, password, role),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: usersKeys.all });
            toast.success("User created");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to create user")
    });
};

export const useUpdateUserRoleMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, role }: { id: string; role: UserRole }) => usersApi.updateRole(id, role),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
        onError: (error: Error) => toast.error(error.message || "Failed to update role")
    });
};

export const useSetUserActiveMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => usersApi.setActive(id, isActive),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
        onError: (error: Error) => toast.error(error.message || "Failed to update user")
    });
};

export const useResetPasswordMutation = () =>
    useMutation({
        mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) => usersApi.resetPassword(id, newPassword),
        onSuccess: () => toast.success("Password reset"),
        onError: (error: Error) => toast.error(error.message || "Failed to reset password")
    });

// Remote Access — Revoke All Sessions (RF2). Kills every other session across every account —
// this browser's own session survives (server-side, keyed off its own cookie), so no invalidation
// of local auth state is needed here.
export const useRevokeAllSessionsMutation = () =>
    useMutation({
        mutationFn: () => usersApi.revokeAllSessions(),
        onSuccess: ({ revoked }) =>
            toast.success(revoked > 0 ? `Signed out ${revoked} other session${revoked === 1 ? "" : "s"}` : "No other sessions to revoke"),
        onError: (error: Error) => toast.error(error.message || "Failed to revoke sessions")
    });

// Remote Access — Login Instance Label (RF5). The label is read via GET /auth/status (public,
// needed on the logged-out login page), not a users-list field — so success invalidates that
// query key instead of usersKeys.all.
export const useSetInstanceLabelMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (label: string) => usersApi.setInstanceLabel(label),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["auth", "status"] });
            toast.success("Instance label saved");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to save instance label")
    });
};
