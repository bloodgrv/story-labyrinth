import { Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/features/auth/hooks/useAuthStatus";
import { useRevokeAllSessionsMutation, useSetInstanceLabelMutation } from "@/features/auth/hooks/useUsersQuery";

// Remote Access — Login Instance Label (RF5, docs/Remote_Access_Funnel_Design.md §5c). Owner-only
// field shown on the login page so the author can confirm they've reached the right server —
// not a username roster.
export function InstanceLabelCard() {
    const { data: status } = useAuthStatus();
    const setLabelMutation = useSetInstanceLabelMutation();
    const [label, setLabel] = useState("");

    useEffect(() => {
        setLabel(status?.instanceLabel ?? "");
    }, [status?.instanceLabel]);

    const isDirty = label !== (status?.instanceLabel ?? "");

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Instance label</CardTitle>
                <CardDescription>
                    Shown on the login page so you can confirm you're on the right server (useful with remote access).
                </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
                <Input
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Reuben's den"
                    className="max-w-sm"
                />
                <Button onClick={() => setLabelMutation.mutate(label)} disabled={!isDirty || setLabelMutation.isPending}>
                    {setLabelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save
                </Button>
            </CardContent>
        </Card>
    );
}

// Remote Access — Revoke All Sessions (RF2, docs/Remote_Access_Funnel_Design.md §6). Recovers a
// stolen/left-behind (e.g. work PC) cookie without a password reset. This browser's own session
// survives — see authService.ts's revokeAllSessions.
export function RevokeAllSessionsCard() {
    const revokeMutation = useRevokeAllSessionsMutation();
    const [confirmOpen, setConfirmOpen] = useState(false);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Sessions
                </CardTitle>
                <CardDescription>
                    Sign out every other logged-in session across every account — useful if a cookie on a work or
                    shared PC might be compromised. This browser stays signed in.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={revokeMutation.isPending}>
                    {revokeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Revoke all other sessions
                </Button>
            </CardContent>
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Revoke all other sessions?"
                description="Everyone logged in on any other browser or device will be signed out immediately and need to log back in. This browser's own session is not affected."
                confirmLabel="Revoke all"
                onConfirm={() => {
                    revokeMutation.mutate();
                    setConfirmOpen(false);
                }}
            />
        </Card>
    );
}
