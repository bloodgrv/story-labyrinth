import { fetchJSON } from "./apiFactory";

export interface UpdateModeResult {
    portable: boolean;
    platform: "win-x64" | "mac-arm64" | "mac-x64" | null;
}

export interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    releaseUrl: string;
    releaseNotes: string;
    assetAvailable: boolean;
}

// "stopping" and "backing-up" are the two steps added when the updater stopped hard-killing the
// old server: it now asks it to shut down cleanly (flushing Manuscript Failsafe Saves, draining
// in-flight jobs) and then snapshots the database before the new version can migrate it.
export type UpdatePhase =
    | "idle"
    | "downloading"
    | "verifying"
    | "extracting"
    | "stopping"
    | "backing-up"
    | "restarting"
    | "rolling-back"
    | "done"
    | "error";

export interface UpdateStatusResult {
    phase: UpdatePhase;
    pct?: number;
    detail?: string;
    targetVersion?: string;
    previousVersion?: string;
    rolledBack?: boolean;
    /** Where the pre-update database snapshot was written, so a failure message can point at it. */
    backupPath?: string;
    message?: string;
    updatedAt?: string;
}

export const updateApi = {
    mode: () => fetchJSON<UpdateModeResult>("/update/mode"),
    check: () => fetchJSON<UpdateCheckResult>("/update/check"),
    status: () => fetchJSON<UpdateStatusResult>("/update/status"),
    start: () => fetchJSON<{ started: boolean; targetVersion: string }>("/update/start", { method: "POST" })
};
