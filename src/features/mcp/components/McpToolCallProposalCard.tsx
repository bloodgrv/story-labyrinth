import { Check, Wrench, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useMcpConnectionsQuery } from "@/features/mcp/hooks/useMcpConnectionsQuery";
import type { McpToolCallProposal } from "@/types/mcpConnection";

interface McpToolCallProposalCardProps {
    items: McpToolCallProposal[];
    onAccept: (item: McpToolCallProposal) => void;
    onReject: (item: McpToolCallProposal) => void;
    isSubmitting?: boolean;
}

// MCP M2, docs/MCP_Tool_Connections_Design.md §3.3/§3.5 — sibling to TimelinePinProposalCard.tsx
// (multi-item, one Accept/Reject per row, no "Accept all" — unlike a batch of timeline pins,
// each tool call is its own real side effect the user should look at individually). Reject is a
// local dismiss only (design §3.3 "Reject | Dismiss only — no call, no message").
export function McpToolCallProposalCard({ items, onAccept, onReject, isSubmitting }: McpToolCallProposalCardProps) {
    // Connection names aren't in the fence payload (only connectionId is) — resolve against the
    // already-fetched connections list (M0's useMcpConnectionsQuery) rather than adding another
    // per-message fetch.
    const { data: connections } = useMcpConnectionsQuery();
    const connectionName = (connectionId: string) => connections?.find(c => c.id === connectionId)?.name ?? connectionId;

    if (items.length === 0) return null;

    return (
        <Card className="border-dashed">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                        <Wrench className="h-3 w-3" />
                        MCP tool call
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                        Proposes {items.length} tool call{items.length === 1 ? "" : "s"}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {items.map((item, index) => (
                    <div key={`${item.connectionId}-${item.toolName}-${index}`} className="flex items-start justify-between gap-2 border rounded-md px-3 py-2">
                        <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium truncate">
                                {connectionName(item.connectionId)} / {item.toolName}
                            </p>
                            <p className="text-xs text-muted-foreground">{item.reason}</p>
                            {Object.keys(item.args).length > 0 && (
                                <pre className="text-xs bg-muted rounded p-1.5 overflow-x-auto max-w-full">
                                    {JSON.stringify(item.args, null, 2)}
                                </pre>
                            )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => onAccept(item)} disabled={isSubmitting}>
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onReject(item)} disabled={isSubmitting}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
