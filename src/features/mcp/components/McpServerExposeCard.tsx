import { Check, Copy, KeyRound, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    useMcpServerSettingsQuery,
    useRevokeMcpServerTokenMutation,
    useRotateMcpServerTokenMutation,
    useSetMcpServerEnabledMutation
} from "@/features/mcp/hooks/useMcpServerSettingsQuery";

// M4 (docs/MCP_Tool_Connections_Design.md §4.3) — sibling to McpConnectionsSettingsCard.tsx, but
// the opposite direction: this app exposing its OWN data to external MCP clients, rather than
// this app calling out to someone else's tools. Off by default. The install bearer token is
// generated server-side and shown here exactly once (design §4.2) — `rawToken` is local component
// state only, never written into the React Query cache (useMcpServerSettingsQuery.ts's own
// comment), so it can't accidentally resurface on a re-render/refetch.
export function McpServerExposeCard() {
    const { data: settings, isLoading } = useMcpServerSettingsQuery();
    const setEnabledMutation = useSetMcpServerEnabledMutation();
    const rotateMutation = useRotateMcpServerTokenMutation();
    const revokeMutation = useRevokeMcpServerTokenMutation();
    const [rawToken, setRawToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState(false);

    const endpointUrl = `${window.location.origin}/mcp`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
    };

    const handleRotate = () => {
        setRawToken(null);
        rotateMutation.mutate(undefined, { onSuccess: result => setRawToken(result.token) });
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Expose as MCP Server
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Let an external MCP client (e.g. Claude Desktop, another agent) read this app's story data —
                        Lorebook search, chapters, notes, and the story timeline. Read-only.
                    </p>
                </div>
                {!isLoading && (
                    <Switch
                        checked={settings?.enabled ?? false}
                        onCheckedChange={enabled => setEnabledMutation.mutate(enabled)}
                        disabled={setEnabledMutation.isPending}
                    />
                )}
            </CardHeader>
            {settings?.enabled && (
                <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
                        <div className="flex gap-2">
                            <Input readOnly value={endpointUrl} className="font-mono text-xs" />
                            <Button variant="outline" size="icon" onClick={() => handleCopy(endpointUrl)}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Label className="text-xs text-muted-foreground">Install token</Label>
                            {settings.hasToken && (
                                <Badge variant="outline" className="text-[10px] gap-1">
                                    <KeyRound className="h-3 w-3" />
                                    Set
                                    {settings.tokenCreatedAt && ` — ${new Date(settings.tokenCreatedAt).toLocaleDateString()}`}
                                </Badge>
                            )}
                        </div>

                        {rawToken ? (
                            <div className="space-y-2 rounded-md border border-dashed p-3">
                                <p className="text-xs text-muted-foreground">
                                    Copy this now — it won't be shown again.
                                </p>
                                <div className="flex gap-2">
                                    <Input readOnly value={rawToken} className="font-mono text-xs" />
                                    <Button variant="outline" size="icon" onClick={() => handleCopy(rawToken)}>
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setRawToken(null)}>
                                    Done
                                </Button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={handleRotate} disabled={rotateMutation.isPending}>
                                    {settings.hasToken ? "Rotate token" : "Generate token"}
                                </Button>
                                {settings.hasToken && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmRevoke(true)}
                                        disabled={revokeMutation.isPending}
                                    >
                                        Revoke
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            )}

            <ConfirmDialog
                open={confirmRevoke}
                onOpenChange={setConfirmRevoke}
                title="Revoke install token"
                description="Any external MCP client currently using this token will immediately lose access. You'll need to generate a new token and reconfigure the client to restore it."
                onConfirm={() => {
                    revokeMutation.mutate();
                    setConfirmRevoke(false);
                }}
            />
        </Card>
    );
}
