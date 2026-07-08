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
