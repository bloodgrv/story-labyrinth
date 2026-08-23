import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../../package.json" with { type: "json" };

const APP_VERSION = pkg.version;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This file runs from two different locations depending on environment: in dev, tsx executes
// it in place at server/routes/, next to the repo's own public/ dir; in production it's compiled
// to dist/server/server/routes/, where the logo instead lives under the Vite-built dist/client/
// (Vite copies public/ into the client build output). Try both rather than picking one.
const loadLogoDataUri = (): string | null => {
    const candidates = [
        path.join(__dirname, "../../public/brand/sl-monogram.png"),
        path.join(__dirname, "../../../client/brand/sl-monogram.png")
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return `data:image/png;base64,${fs.readFileSync(candidate).toString("base64")}`;
        }
    }
    return null;
};

const logoDataUri = loadLogoDataUri();

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, char => {
        switch (char) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&#39;";
        }
    });

const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
};

export interface StatusPageData {
    nodeEnv: string;
    port: string | number;
    dbPath: string;
    jobRunnerStarted: boolean;
    // P1.1 — the runner can now have several jobs in flight at once (one per distinct jobType),
    // not just one.
    currentJobIds: string[];
    // Portable builds (win-x64/mac-arm64/mac-x64) genuinely restart on this button — see
    // index.ts's `shutdown`'s own comment. Everywhere else (Docker/dev) it's still shutdown-only,
    // relying on an external supervisor. The note below reflects whichever is actually true.
    isPortableBuild: boolean;
}

export const renderStatusPage = (data: StatusPageData): string => {
    const uptime = formatUptime(process.uptime());
    const rows: [string, string][] = [
        ["Environment", data.nodeEnv],
        ["Port", String(data.port)],
        ["Uptime", uptime],
        ["Job runner", data.jobRunnerStarted ? "running" : "stopped"],
        ["Active jobs", data.currentJobIds.length > 0 ? data.currentJobIds.join(", ") : "none"],
        ["Database", data.dbPath],
        ["App version", APP_VERSION]
    ];

    const rowsHtml = rows
        .map(
            ([label, value]) =>
                `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
        )
        .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Story Labyrinth — Server Status</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at top, #241b3a 0%, #120d1f 70%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #e8e3f5;
  }
  main {
    width: min(560px, 92vw);
    background: rgba(30, 22, 48, 0.85);
    border: 1px solid rgba(168, 130, 255, 0.25);
    border-radius: 14px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.45);
  }
  .subtitle { margin: 0 0 24px; color: #a99fc4; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid rgba(168,130,255,0.12); font-size: 0.9rem; }
  th { color: #a99fc4; font-weight: 500; width: 40%; }
  td { color: #e8e3f5; word-break: break-all; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  button {
    flex: 1;
    min-width: 140px;
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid rgba(168,130,255,0.35);
    background: rgba(168,130,255,0.12);
    color: #e8e3f5;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  button:hover { background: rgba(168,130,255,0.24); }
  button.danger { border-color: rgba(246,110,110,0.4); background: rgba(246,110,110,0.12); }
  button.danger:hover { background: rgba(246,110,110,0.24); }
  #actionResult { margin-top: 14px; font-size: 0.85rem; color: #a99fc4; min-height: 1.2em; }
  .note { margin-top: 18px; font-size: 0.78rem; color: #766f8c; line-height: 1.5; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .brand img { width: 40px; height: 40px; }
  .brand h1 {
    margin: 0;
    font-size: 1.5rem;
    background: linear-gradient(90deg, #b794f6, #f6a6d8);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
</style>
</head>
<body>
<main>
  <div class="brand">
    ${logoDataUri ? `<img src="${logoDataUri}" alt="Story Labyrinth" />` : ""}
    <h1>Story Labyrinth</h1>
  </div>
  <p class="subtitle">Server status</p>
  <table>
    ${rowsHtml}
  </table>
  <div class="actions">
    <button id="restartBtn">Restart server</button>
    <button id="shutdownBtn" class="danger">Shutdown server</button>
  </div>
  <div id="actionResult"></div>
  <p class="note">
    ${
        data.isPortableBuild
            ? "Restart gracefully stops the process, then launches a fresh copy on the same port — the app should be reachable again within a few seconds. Shutdown just stops it (no relaunch)."
            : "Restart gracefully stops the process; it only comes back automatically under a supervisor that restarts on exit (e.g. Docker's <code>restart: unless-stopped</code> in production). In local dev (<code>tsx watch</code>), you'll need to start it again manually."
    }
  </p>
</main>
<script>
  async function callAction(path, label) {
    const result = document.getElementById('actionResult');
    if (!confirm('Are you sure you want to ' + label + ' the server?')) return;
    result.textContent = 'Sending request…';
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed: ' + res.status);
      result.textContent = label.charAt(0).toUpperCase() + label.slice(1) + ' requested. The server is going down now.';
    } catch (err) {
      result.textContent = 'Error: ' + err.message;
    }
  }
  document.getElementById('restartBtn').addEventListener('click', () => callAction('/_status/restart', 'restart'));
  document.getElementById('shutdownBtn').addEventListener('click', () => callAction('/_status/shutdown', 'shut down'));
</script>
</body>
</html>`;
};
