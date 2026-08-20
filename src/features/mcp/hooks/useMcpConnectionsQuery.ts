import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { mcpConnectionsApi } from "@/services/api/client";
import type { McpConnectionUpsertRequest, McpToolCallRequest } from "@/types/mcpConnection";

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

// M1/M2 — Accept on an mcp-tool-call-proposal card. No cache invalidation of mcpConnectionsKeys
// here (a call never mutates a connection row); the caller's own onSuccess is responsible for
// feeding the returned chat row back into the chat's own state (see ChatInterface.tsx's
// handleAcceptMcpToolCall). A pre-call rejection (disabled/out-of-scope/unknown-tool/bad-args/
// duplicate) surfaces via this toast — design §3.3/§3.4: those never write a transcript message,
// so a toast is the only feedback the user gets for that branch.
export const useMcpToolCallMutation = () =>
    useMutation({
        mutationFn: ({ connectionId, data }: { connectionId: string; data: McpToolCallRequest }) => mcpConnectionsApi.callTool(connectionId, data),
        onError: (error: Error) => toast.error(error.message || "Failed to call tool")
    });
