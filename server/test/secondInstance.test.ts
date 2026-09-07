import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./integrationServer.js";

// Second-instance startup (server/index.ts's `startServer`).
//
// Why this is an integration suite and not a unit test: the bug it protects against was invisible
// to reasoning and only appeared when two real processes ran at once. The obvious fix — start the
// database work from app.listen()'s success callback, so a doomed process never migrates — looks
// airtight and is not: on Windows the 'listening' event fires FIRST and EADDRINUSE arrives right
// behind it, so the callback's synchronous runMigrations() completes before the error is ever
// dispatched. Observed exactly that: a second instance logged "Server running on port ..." and a
// full migration pass against the live instance's database before printing the conflict.
//
// The invariant that actually matters is the last assertion in each test: a process that cannot
// have the port must not touch the database. Two processes migrating one SQLite file is the same
// class of hazard the portable updater's whole design avoids.
//
// This is easy to hit by accident on a portable build — an in-app update leaves the old launcher
// window looking dead (the replacement runs detached, no console of its own), so double-clicking
// the launcher again is the natural move.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SERVER_ENTRY = path.join(REPO_ROOT, "server", "index.ts");

interface RunResult {
    code: number | null;
    output: string;
}

/** Boots server/index.ts against an already-occupied port and resolves once it gives up. */
const startAgainstOccupiedPort = (port: number, dbPath: string): Promise<RunResult> =>
    new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [TSX_CLI, SERVER_ENTRY], {
            cwd: REPO_ROOT,
            env: { ...process.env, NODE_ENV: "test", PORT: String(port), DATABASE_PATH: dbPath },
            stdio: ["ignore", "pipe", "pipe"]
        });

        let output = "";
        child.stdout?.on("data", chunk => (output += chunk.toString()));
        child.stderr?.on("data", chunk => (output += chunk.toString()));

        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`Second instance never exited. Output so far:\n${output}`));
        }, 45_000);

        child.on("exit", code => {
            clearTimeout(timer);
            resolve({ code, output });
        });
        child.on("error", error => {
            clearTimeout(timer);
            reject(error);
        });
    });

const findFreePort = async (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.on("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const address = probe.address();
            if (typeof address === "string" || address === null) {
                probe.close();
                reject(new Error("Could not determine a free port"));
                return;
            }
            const { port } = address;
            probe.close(() => resolve(port));
        });
    });

let server: TestServer;
let port: number;

beforeAll(async () => {
    server = await startTestServer();
    port = Number(new URL(server.baseUrl).port);
}, 120_000);

afterAll(async () => {
    await server?.stop();
});

describe("starting a second instance", () => {
    it("refuses to start, explains why, and never touches the database", async () => {
        const { code, output } = await startAgainstOccupiedPort(port, server.dbPath);

        expect(code).toBe(1);
        expect(output).toContain(`Story Labyrinth is already running on port ${port}`);
        // The two things a user in this situation actually needs.
        expect(output).toContain(`http://localhost:${port}`);
        expect(output).toContain("/_status");

        // The data-safety invariant. "Running database migrations..." is runMigrations()'s own first
        // line, and takePreMigrationSnapshot() runs immediately before it — if either appears here,
        // a process that never owned the port has written to a live database.
        expect(output).not.toContain("Running database migrations");
        // It must not have bound either, which is what the naive fix got wrong.
        expect(output).not.toContain("Server running on port");
    }, 60_000);

    it("leaves the running instance completely unaffected", async () => {
        const response = await server.fetch("/api/health");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: "ok", ready: true });
    });

    it("says so plainly when the port belongs to some other program", async () => {
        const otherPort = await findFreePort();
        const hog = http.createServer((_request, response) => response.end("not story labyrinth"));
        await new Promise<void>(resolve => hog.listen(otherPort, "127.0.0.1", resolve));

        try {
            const { code, output } = await startAgainstOccupiedPort(otherPort, server.dbPath);

            expect(code).toBe(1);
            // Blaming a second copy of the app here would send the user looking for a window that
            // does not exist.
            expect(output).toContain(`Port ${otherPort} is already in use by another program`);
            expect(output).not.toContain("Running database migrations");
        } finally {
            await new Promise<void>(resolve => hog.close(() => resolve()));
        }
    }, 60_000);
});
