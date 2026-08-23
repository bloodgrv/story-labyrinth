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

export type UpdatePhase = "idle" | "downloading" | "verifying" | "extracting" | "restarting" | "rolling-back" | "done" | "error";

export interface UpdateStatusResult {
    phase: UpdatePhase;
    pct?: number;
    targetVersion?: string;
    previousVersion?: string;
    rolledBack?: boolean;
    message?: string;
    updatedAt?: string;
}

export const updateApi = {
    mode: () => fetchJSON<UpdateModeResult>("/update/mode"),
    check: () => fetchJSON<UpdateCheckResult>("/update/check"),
    status: () => fetchJSON<UpdateStatusResult>("/update/status"),
    start: () => fetchJSON<{ started: boolean; targetVersion: string }>("/update/start", { method: "POST" })
};
