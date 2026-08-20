import { Loader2, Pencil, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    useDeleteMcpConnectionMutation,
    useMcpConnectionsQuery,
    useRefreshMcpToolsMutation
} from "@/features/mcp/hooks/useMcpConnectionsQuery";
import type { McpConnection } from "@/types/mcpConnection";
import { McpConnectionEditorDialog } from "./McpConnectionEditorDialog";

interface McpConnectionsSettingsCardProps {
    // null = Settings' global view; set = a story context, so "This story" scope is offered.
    storyId: string | null;
}

// MCP Tool Connections (M0-M3, docs/MCP_Tool_Connections_Design.md) — owner-only list+dialog CRUD,
// mirrors PlaybookPacksPanel.tsx's shape. Chat integration (per-chat "Include MCP tools" toggle,
// propose→Accept tool calls) is wired up as of M2-M3. Only the server-expose side (M4, "Expose as
// MCP server") isn't built yet.
export function McpConnectionsSettingsCard({ storyId }: McpConnectionsSettingsCardProps) {
    const { data: connections, isLoading } = useMcpConnectionsQuery();
    const deleteMutation = useDeleteMcpConnectionMutation();
    const refreshMutation = useRefreshMcpToolsMutation();
    const [editingConnection, setEditingConnection] = useState<McpConnection | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle>MCP Connections</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Register external Streamable HTTP MCP servers. Enable one, refresh its tools, then arm a chat's
                        own "Include MCP tools" toggle to let it propose calling them.
                    </p>
                </div>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plug className="h-4 w-4 mr-2" />
                    New connection
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {isLoading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : !connections || connections.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No connections yet.</p>
                ) : (
                    <div className="divide-y rounded-md border">
                        {connections.map(connection => (
                            <div key={connection.id} className="flex items-start justify-between gap-3 p-3">
                                <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium">{connection.name}</span>
                                        <Badge variant={connection.enabled ? "default" : "outline"} className="text-[10px]">
                                            {connection.enabled ? "Enabled" : "Disabled"}
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {connection.scope === "story" ? "This story" : "Global"}
                                        </Badge>
                                        {connection.allowPrivateNetwork && (
                                            <Badge variant="outline" className="text-[10px]">
                                                LAN allowed
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">{connection.url}</p>
                                    {connection.lastToolsError ? (
                                        <p className="text-xs text-destructive">{connection.lastToolsError}</p>
                                    ) : connection.lastToolsFetch ? (
                                        <p className="text-xs text-muted-foreground">
                                            {connection.toolsCatalogue.length} tool{connection.toolsCatalogue.length === 1 ? "" : "s"} —
                                            last refreshed {new Date(connection.lastToolsFetch).toLocaleString()}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">Not refreshed yet.</p>
                                    )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        title="Refresh tools"
                                        disabled={refreshMutation.isPending}
                                        onClick={() => refreshMutation.mutate(connection.id)}
                                    >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingConnection(connection)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(connection.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Expose this app as an MCP server — coming later (M4).
                </div>
            </CardContent>

            <McpConnectionEditorDialog connection={null} createStoryId={storyId} open={createOpen} onOpenChange={setCreateOpen} />
            <McpConnectionEditorDialog
                connection={editingConnection}
                createStoryId={storyId}
                open={editingConnection !== null}
                onOpenChange={open => !open && setEditingConnection(null)}
            />
        </Card>
    );
}
