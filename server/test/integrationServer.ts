import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Integration harness for the invariant suites (B49, docs/HEALTH_REVIEW_2026-09-06.md's H4).
//
// Spawns the REAL server (server/index.ts, via tsx) against a throwaway SQLite file on a free
// port, rather than mounting routers into a test-only Express app. That choice is the point:
// the invariants these suites protect — the chapter-content CAS, the Codex approve claim, the
// chat messages CAS — live in route handlers behind the real middleware chain (requireAuth,
// blockViewerMutations, Zod), so a hand-assembled app would prove a copy, not the thing that
// ships. It also re-runs the real migration runner on every invocation, which is free coverage
// for a component that has caused two live incidents.
//
// Cost is one ~8s cold boot per suite file (93 migrations + seeds + job runner). Vitest runs
// files in parallel, so keep related invariants together in one file rather than splitting
// finely — the boot dominates, not the assertions.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SERVER_ENTRY = path.join(REPO_ROOT, "server", "index.ts");

// Boot budget. Generous on purpose: a cold first boot on a slow disk runs every migration and
// seed before /api/health flips `ready`, and a flaky timeout here would look like a real failure.
const READY_TIMEOUT_MS = 90_000;

export interface ApiResponse<T = unknown> {
    status: number;
    body: T;
}

export interface TestServer {
    baseUrl: string;
    /**
     * This run's throwaway SQLite file. Exposed so a test can arrange state that no HTTP route can
     * produce — e.g. a Codex pending change carrying `secrets`, which the propose route's Zod
     * schema rejects at the door but chatCodexService.ts's own producer creates unvalidated. Point
     * `process.env.DATABASE_PATH` at this before dynamically importing a repository module.
     * Use sparingly: a test that can go through a route should.
     */
    dbPath: string;
    /** Authenticated as the bootstrap owner account. Bodies are JSON in, JSON out. */
    api: <T = unknown>(method: string, path: string, body?: unknown) => Promise<ApiResponse<T>>;
    /** Raw fetch against the server with the owner session cookie attached. */
    fetch: (path: string, init?: RequestInit) => Promise<Response>;
    stop: () => Promise<void>;
}

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

export interface TestServerOptions {
    /**
     * Extra environment for the spawned server. Used by the job-queue suite to shorten
     * `JOB_TICK_INTERVAL_MS` — a 3s production claim tick turns that suite into a ~50s wait.
     */
    env?: Record<string, string>;
}

export const startTestServer = async (options: TestServerOptions = {}): Promise<TestServer> => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-integration-"));
    const dbPath = path.join(dataDir, "test.db");
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    // NODE_ENV=test deliberately: index.ts only branches on it to add CORS (development) or serve
    // the built SPA (production), neither of which an API test wants.
    const child: ChildProcess = spawn(process.execPath, [TSX_CLI, SERVER_ENTRY], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            NODE_ENV: "test",
            PORT: String(port),
            DATABASE_PATH: dbPath,
            ...(options.env ?? {})
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    // Kept so a boot failure reports what the server actually said instead of a bare timeout.
    let output = "";
    child.stdout?.on("data", chunk => (output += chunk.toString()));
    child.stderr?.on("data", chunk => (output += chunk.toString()));

    // Held in an object rather than a bare `let`: TypeScript narrows a closure-assigned local to
    // its initializer type at every read site, which would make `exited` unusable as a union here.
    const exit: { info: { code: number | null; signal: NodeJS.Signals | null } | null } = { info: null };
    child.on("exit", (code, signal) => (exit.info = { code, signal }));

    const stop = async (): Promise<void> => {
        if (!exit.info) {
            child.kill();
            // Give the graceful path (job drain + manuscript backup flush) a moment, then insist.
            await new Promise<void>(resolve => {
                const timer = setTimeout(() => {
                    child.kill("SIGKILL");
                    resolve();
                }, 5_000);
                child.on("exit", () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }
        // Best-effort: Windows can still hold the SQLite WAL briefly after exit, and a leftover
        // temp dir is not worth failing a green suite over.
        try {
            fs.rmSync(dataDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    };

    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
        if (exit.info) {
            await stop();
            throw new Error(`Test server exited before becoming ready (code ${exit.info.code}).\n${output}`);
        }
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) {
                const health = (await response.json()) as { ready?: boolean };
                if (health.ready) {
                    ready = true;
                    break;
                }
            }
        } catch {
            // Not listening yet — keep polling.
        }
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (!ready) {
        await stop();
        throw new Error(`Test server never reported ready within ${READY_TIMEOUT_MS}ms.\n${output}`);
    }

    // Bootstrap the single owner account. POST /api/auth/register is only open while no account
    // exists, which is exactly the state a fresh database is in.
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "integration-owner", password: "integration-test-password" })
    });
    if (registerResponse.status !== 201) {
        await stop();
        throw new Error(`Could not register the bootstrap owner: ${registerResponse.status} ${await registerResponse.text()}`);
    }

    // The session cookie is httpOnly, so read it off the response rather than from any store.
    const setCookie = registerResponse.headers.get("set-cookie");
    if (!setCookie) {
        await stop();
        throw new Error("Register succeeded but returned no session cookie");
    }
    const cookie = setCookie.split(";")[0];

    const authedFetch = (requestPath: string, init: RequestInit = {}): Promise<Response> =>
        fetch(`${baseUrl}${requestPath}`, {
            ...init,
            headers: { ...(init.headers ?? {}), cookie }
        });

    const api = async <T = unknown>(method: string, requestPath: string, body?: unknown): Promise<ApiResponse<T>> => {
        const response = await authedFetch(requestPath, {
            method,
            headers: body === undefined ? {} : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await response.text();
        // Some routes legitimately answer with an empty body (204-shaped deletes). A non-JSON body
        // means the request never reached a real handler (typically a 404 HTML page from a URL that
        // doesn't exist) — say that plainly rather than surfacing a bare JSON.parse SyntaxError,
        // which reads like a server bug and sends you looking in the wrong place.
        if (!text) return { status: response.status, body: null as T };
        try {
            return { status: response.status, body: JSON.parse(text) as T };
        } catch {
            throw new Error(
                `${method} ${requestPath} returned ${response.status} with a non-JSON body — ` +
                    `is that route real? First 200 chars: ${text.slice(0, 200)}`
            );
        }
    };

    return { baseUrl, dbPath, api, fetch: authedFetch, stop };
};

/** Creates a story and returns its id. Every suite needs one; none of them care about its fields. */
export const createStory = async (server: TestServer, title = "Integration Story"): Promise<string> => {
    const { status, body } = await server.api<{ id: string }>("POST", "/api/stories", {
        title,
        author: "Integration Suite",
        language: "en"
    });
    if (status !== 201) throw new Error(`Could not create story: ${status} ${JSON.stringify(body)}`);
    return body.id;
};
