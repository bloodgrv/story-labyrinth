import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useStartUpdateMutation, useUpdateCheckQuery, useUpdateStatusQuery } from "@/features/ai/hooks/useUpdateQuery";
import type { UpdatePhase } from "@/services/api/updateClient";
import { version as runningVersion } from "../../../../package.json";

const PHASE_LABELS: Record<UpdatePhase, string> = {
    idle: "",
    downloading: "Downloading",
    verifying: "Verifying download",
    extracting: "Extracting",
    stopping: "Saving your work and stopping the app",
    "backing-up": "Backing up your database",
    restarting: "Restarting",
    "rolling-back": "New version failed to start — rolling back",
    done: "Done",
    error: "Update failed"
};

const HEALTH_POLL_INTERVAL_MS = 1500;
const HEALTH_POLL_TIMEOUT_MS = 60_000;

// Once the updater kills the old server (see scripts/portable-updater/update-runner.mjs), this
// same tab can no longer poll GET /api/update/status — that process is gone. Switch to plain
// /api/health polling until a server answers again (the new version, or the old one if the
// updater rolled back), then reload so the client picks up whatever's now actually running.
function pollForServerBackUp(onBackUp: () => void) {
    const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;
    const tick = async () => {
        try {
            const res = await fetch("/api/health");
            if (res.ok) {
                onBackUp();
                return;
            }
        } catch {
            // still down — keep polling
        }
        if (Date.now() < deadline) setTimeout(tick, HEALTH_POLL_INTERVAL_MS);
    };
    setTimeout(tick, HEALTH_POLL_INTERVAL_MS);
}

// Portable-build-only (see useUpdateModeQuery gating this card's whole Settings section) — full
// download/verify/extract/relaunch self-updater. Docker's own update path is a plain
// `docker compose pull && up -d`, no UI needed.
export function UpdatesSettingsCard() {
    const [checkEnabled, setCheckEnabled] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);

    const checkQuery = useUpdateCheckQuery(checkEnabled);
    const statusQuery = useUpdateStatusQuery(updating);
    const startMutation = useStartUpdateMutation();

    const phase = statusQuery.data?.phase ?? "idle";

    useEffect(() => {
        if (!updating) return;
        if (phase !== "restarting" && phase !== "done") return;
        // "done" only fires after the new process already answered a health check itself
        // (see update-runner.mjs's waitForHealth) — but THIS tab's session cookie/app state is
        // still pointed at the old process's response, so still reconnect-and-reload rather than
        // trusting the status payload alone.
        setReconnecting(true);
        pollForServerBackUp(() => window.location.reload());
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per phase transition into restarting/done, not on every statusQuery refetch
    }, [phase, updating]);

    // Every path out of `updating` matters: it used to be set true and never set false again, so a
    // failed POST /start left the card spinning on "Working…" forever, and a runner-reported
    // `phase: "error"` rendered a *spinner* labelled "Update failed" while the block below that
    // actually explains why (gated on `!updating`) was unreachable. A page reload was the only exit.
    useEffect(() => {
        if (updating && phase === "error") setUpdating(false);
    }, [updating, phase]);

    const handleUpdateNow = () => {
        setConfirmOpen(false);
        setUpdating(true);
        startMutation.mutate(undefined, { onError: () => setUpdating(false) });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Running version</span>
                    <Badge variant="outline">{runningVersion}</Badge>
                </div>

                {reconnecting ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Waiting for the app to come back up — this page will reload automatically.
                    </p>
                ) : updating ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {PHASE_LABELS[phase] || "Working…"}
                        {typeof statusQuery.data?.pct === "number" && phase === "downloading" && ` (${statusQuery.data.pct}%)`}
                        {statusQuery.data?.detail && ` — ${statusQuery.data.detail}`}
                    </p>
                ) : (
                    <>
                        {!checkEnabled ? (
                            <Button size="sm" variant="outline" onClick={() => setCheckEnabled(true)}>
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Check for updates
                            </Button>
                        ) : checkQuery.isLoading ? (
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Checking…
                            </p>
                        ) : checkQuery.isError ? (
                            <p className="text-sm text-destructive">Couldn't check for updates. Try again later.</p>
                        ) : checkQuery.data?.updateAvailable ? (
                            <div className="space-y-2">
                                <p className="text-sm">
                                    <span className="font-medium">v{checkQuery.data.latestVersion}</span> is available.{" "}
                                    <a
                                        href={checkQuery.data.releaseUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary underline inline-flex items-center gap-1"
                                    >
                                        Release notes <ExternalLink className="h-3 w-3" />
                                    </a>
                                </p>
                                {checkQuery.data.assetAvailable ? (
                                    <Button size="sm" onClick={() => setConfirmOpen(true)}>
                                        Update & restart
                                    </Button>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        That release has no portable build asset yet — check back later.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                You're on the latest version.
                            </p>
                        )}
                    </>
                )}

                {!updating && phase === "error" && statusQuery.data?.message && (
                    <div className="space-y-1">
                        <p className="text-xs text-destructive break-words">{statusQuery.data.message}</p>
                        {statusQuery.data.backupPath && (
                            <p className="text-xs text-muted-foreground break-words">
                                Pre-update database backup: <code>{statusQuery.data.backupPath}</code>
                            </p>
                        )}
                    </div>
                )}
            </CardContent>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Update & restart?"
                description={`This downloads v${checkQuery.data?.latestVersion}, saves your work, snapshots your database to data/backups/, then restarts the app — the whole server (and this page) goes down for a few seconds during the swap. If the new version doesn't start, both the app and the database are rolled back automatically.`}
                confirmLabel="Update & restart"
                onConfirm={handleUpdateNow}
            />
        </Card>
    );
}
