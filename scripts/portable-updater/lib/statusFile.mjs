// Shared status file the update-runner writes to and the still-running old server's
// GET /api/update/status route reads from — the only channel between the two processes
// (they can't share memory; the old server doesn't know the updater's progress any other way).
// Plain fs, no locking: writes are small/infrequent and this is a single-user local app, so a
// torn read is not a realistic concern.

import fs from "node:fs";
import path from "node:path";

export const statusFilePath = root => path.join(root, "versions", ".update-status.json");

export function writeStatus(root, status) {
    const file = statusFilePath(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }));
}

export function readStatus(root) {
    const file = statusFilePath(root);
    if (!fs.existsSync(file)) return { phase: "idle" };
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { phase: "idle" };
    }
}
