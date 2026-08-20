import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { mcpConnectionsApi } from "@/services/api/client";
import type { McpConnectionUpsertRequest } from "@/types/mcpConnection";

export const mcpConnectionsKeys = {
    all: ["mcpConnections"] as const,
    list: () => [...mcpConnectionsKeys.all, "list"] as const
};

export const useMcpConnectionsQuery = () =>
    useQuery({
        queryKey: mcpConnectionsKeys.list(),
        queryFn: mcpConnectionsApi.list
    });

export const useCreateMcpConnectionMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: McpConnectionUpsertRequest) => mcpConnectionsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: mcpConnectionsKeys.list() });
            toast.success("Connection created");
        },
        onError: () => toast.error("Failed to create connection")
    });
};

export const useUpdateMcpConnectionMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<McpConnectionUpsertRequest> }) => mcpConnectionsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: mcpConnectionsKeys.list() });
            toast.success("Connection updated");
        },
        onError: () => toast.error("Failed to update connection")
    });
};

export const useDeleteMcpConnectionMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => mcpConnectionsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: mcpConnectionsKeys.list() });
            toast.success("Connection deleted");
        },
        onError: () => toast.error("Failed to delete connection")
    });
};

export const useRefreshMcpToolsMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => mcpConnectionsApi.refreshTools(id),
        onSuccess: result => {
            queryClient.invalidateQueries({ queryKey: mcpConnectionsKeys.list() });
            if (result.success) toast.success(`Loaded ${result.connection?.toolsCatalogue.length ?? 0} tools`);
            else toast.error(result.error ?? "Failed to refresh tools");
        },
        onError: () => toast.error("Failed to refresh tools")
    });
};
