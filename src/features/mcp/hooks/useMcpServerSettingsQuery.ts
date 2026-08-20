import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { mcpServerApi } from "@/services/api/client";

// M4 (docs/MCP_Tool_Connections_Design.md §4) — mirrors useMcpConnectionsQuery.ts's shape for the
// separate server-expose direction. rotateToken's mutation deliberately returns the raw token to
// its caller (McpServerExposeCard.tsx) rather than writing it into the query cache — the cache
// only ever holds the redacted settings shape (enabled/hasToken/tokenCreatedAt), so a re-render or
// refetch can never accidentally re-surface a token that should only be shown once.

export const mcpServerSettingsKeys = {
    all: ["mcpServerSettings"] as const
};

export const useMcpServerSettingsQuery = () =>
    useQuery({
        queryKey: mcpServerSettingsKeys.all,
        queryFn: mcpServerApi.getSettings
    });

export const useSetMcpServerEnabledMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (enabled: boolean) => mcpServerApi.setEnabled(enabled),
        onSuccess: settings => {
            queryClient.setQueryData(mcpServerSettingsKeys.all, settings);
        },
        onError: () => toast.error("Failed to update MCP server settings")
    });
};

export const useRotateMcpServerTokenMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: mcpServerApi.rotateToken,
        onSuccess: result => {
            // Only the redacted shape goes into the cache — the raw token stays local to whichever
            // component's local state the caller puts it in.
            queryClient.setQueryData(mcpServerSettingsKeys.all, (prev: { enabled: boolean } | undefined) => ({
                enabled: prev?.enabled ?? true,
                hasToken: true,
                tokenCreatedAt: result.tokenCreatedAt
            }));
            toast.success("New token generated");
        },
        onError: () => toast.error("Failed to generate a new token")
    });
};

export const useRevokeMcpServerTokenMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: mcpServerApi.revokeToken,
        onSuccess: settings => {
            queryClient.setQueryData(mcpServerSettingsKeys.all, settings);
            toast.success("Token revoked");
        },
        onError: () => toast.error("Failed to revoke the token")
    });
};
