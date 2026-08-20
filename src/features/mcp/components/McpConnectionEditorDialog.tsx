import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateMcpConnectionMutation, useUpdateMcpConnectionMutation } from "@/features/mcp/hooks/useMcpConnectionsQuery";
import type { McpConnection, McpConnectionScope } from "@/types/mcpConnection";

interface McpConnectionEditorDialogProps {
    // null = create new.
    connection: McpConnection | null;
    // Only used when creating: which story a "This story" scope pins to.
    createStoryId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Create/edit form for one MCP connection (M0). The bearer token field is always empty on open —
// same "never pre-filled, hasToken badge instead" convention as TtsSettingsCard's API key input
// (server/routes/tts.ts's B31 redaction posture) — typing a value updates it, leaving it blank
// keeps whatever token is already stored, and "Clear token" is the only explicit removal path.
export function McpConnectionEditorDialog({ connection, createStoryId, open, onOpenChange }: McpConnectionEditorDialogProps) {
    const [name, setName] = useState(connection?.name ?? "");
    const [url, setUrl] = useState(connection?.url ?? "");
    const [tokenInput, setTokenInput] = useState("");
    const [clearToken, setClearToken] = useState(false);
    const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(connection?.allowPrivateNetwork ?? false);
    const [scope, setScope] = useState<McpConnectionScope>(connection?.scope ?? "global");
    const [enabled, setEnabled] = useState(connection?.enabled ?? false);

    const createMutation = useCreateMcpConnectionMutation();
    const updateMutation = useUpdateMcpConnectionMutation();

    useEffect(() => {
        if (!open) return;
        setName(connection?.name ?? "");
        setUrl(connection?.url ?? "");
        setTokenInput("");
        setClearToken(false);
        setAllowPrivateNetwork(connection?.allowPrivateNetwork ?? false);
        setScope(connection?.scope ?? "global");
        setEnabled(connection?.enabled ?? false);
    }, [open, connection]);

    const isPending = createMutation.isPending || updateMutation.isPending;

    const handleSave = () => {
        const data = {
            name,
            url,
            allowPrivateNetwork,
            scope,
            storyId: scope === "story" ? createStoryId : null,
            enabled,
            ...(tokenInput ? { bearerToken: tokenInput } : {}),
            ...(clearToken ? { clearToken: true } : {})
        };
        if (connection) {
            updateMutation.mutate({ id: connection.id, data }, { onSuccess: () => onOpenChange(false) });
            return;
        }
        createMutation.mutate(data, { onSuccess: () => onOpenChange(false) });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{connection ? "Edit MCP Connection" : "New MCP Connection"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Obsidian vault" />
                    </div>
                    <div className="space-y-1">
                        <Label>URL (Streamable HTTP)</Label>
                        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/mcp" />
                    </div>
                    <div className="space-y-1">
                        <Label>Bearer token {connection?.hasToken && !clearToken && "(already saved)"}</Label>
                        <Input
                            type="password"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            placeholder={connection?.hasToken ? "Leave blank to keep the saved token" : "Optional"}
                            disabled={clearToken}
                        />
                        {connection?.hasToken && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <input
                                    type="checkbox"
                                    checked={clearToken}
                                    onChange={e => {
                                        setClearToken(e.target.checked);
                                        if (e.target.checked) setTokenInput("");
                                    }}
                                />
                                Clear the saved token
                            </label>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Scope</Label>
                            <Select
                                value={scope}
                                onValueChange={value => setScope(value as McpConnectionScope)}
                                disabled={!createStoryId}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="global">Global (every story)</SelectItem>
                                    {createStoryId && <SelectItem value="story">This story</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-md border px-3 py-2">
                            <Label className="text-sm font-normal">Enabled</Label>
                            <Switch checked={enabled} onCheckedChange={setEnabled} />
                        </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div>
                            <Label className="text-sm font-normal">Allow private / LAN targets</Label>
                            <p className="text-xs text-muted-foreground">
                                Off by default. Turn on only for a self-hosted server you trust (localhost, LAN, Tailscale).
                            </p>
                        </div>
                        <Switch checked={allowPrivateNetwork} onCheckedChange={setAllowPrivateNetwork} />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isPending || !name.trim() || !url.trim()}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
