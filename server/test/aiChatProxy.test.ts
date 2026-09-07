import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./integrationServer.js";

// B45 (docs/HEALTH_REVIEW_2026-09-06.md's H1) — the server-side chat generation proxy.
//
// Driven against a fake OpenAI-compatible provider stood up here, so the whole path is real:
// the route, buildChatClient's credential resolution, the OpenAI SDK's streaming client, and the
// SSE the browser ends up parsing. No network, no keys, no provider account.
//
// The `local` provider is what makes this testable — its base URL comes from configuration, so
// pointing a feature endpoint at 127.0.0.1 exercises exactly the same code path a real LM Studio
// or a cloud provider would take.

let server: TestServer;
let fakeProvider: Server;
let fakeProviderUrl: string;

// What the fake provider was last asked for — the assertions about credential resolution read
// this. Held in an object rather than a bare `let`: TypeScript narrows a closure-assigned local
// to its initializer type at every read site, which would make it unusable as a union here.
const seen: { last: { path: string; authorization?: string; body: Record<string, unknown> } | null } = { last: null };
// Resetting through a function, not an inline `seen.last = null`: an inline assignment narrows
// the property to `null` for the rest of the test body, making every later read a type error.
const forgetLastRequest = () => {
    seen.last = null;
};

// Set per-test to control how the fake provider answers.
let respond: (req: { body: Record<string, unknown> }) => { status: number; sse?: string[]; json?: unknown } = () => ({
    status: 200,
    sse: ['{"choices":[{"delta":{"content":"hello"}}]}', '{"choices":[{"delta":{"content":" world"}}]}']
});

const startFakeProvider = (): Promise<void> =>
    new Promise(resolve => {
        fakeProvider = createServer((req, res) => {
            let raw = "";
            req.on("data", chunk => (raw += chunk));
            req.on("end", () => {
                const body = raw ? JSON.parse(raw) : {};
                seen.last = { path: req.url ?? "", authorization: req.headers.authorization, body };
                const answer = respond({ body });

                if (answer.status !== 200) {
                    res.writeHead(answer.status, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(answer.json ?? { error: { message: "upstream failure" } }));
                    return;
                }

                res.writeHead(200, { "Content-Type": "text/event-stream" });
                for (const frame of answer.sse ?? []) res.write(`data: ${frame}\n\n`);
                res.write("data: [DONE]\n\n");
                res.end();
            });
        });
        fakeProvider.listen(0, "127.0.0.1", () => {
            const address = fakeProvider.address();
            if (typeof address === "string" || address === null) throw new Error("no port for the fake provider");
            fakeProviderUrl = `http://127.0.0.1:${address.port}/v1`;
            resolve();
        });
    });

// Reads an SSE body into the frames a browser would see.
const readSse = async (response: Response): Promise<string[]> => {
    const text = await response.text();
    return text
        .split("\n")
        .filter(line => line.startsWith("data: "))
        .map(line => line.slice(6));
};

const generate = (body: Record<string, unknown>) =>
    server.fetch("/api/ai-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            provider: "local",
            model: "test-model",
            messages: [{ role: "user", content: "hi" }],
            ...body
        })
    });

beforeAll(async () => {
    await startFakeProvider();
    server = await startTestServer();

    // The aiSettings row is created lazily by the settings GET (routes/ai.ts), and writing a
    // feature endpoint needs it to exist. In the real app AIService.initialize() does this on load.
    expect((await server.api("GET", "/api/ai/settings")).status).toBe(200);

    // Point the Editor Chat feature at the fake provider. This is the B13-residual case: before
    // B45, a per-feature apiUrl like this applied to every background job but never to live chat.
    const configured = await server.api("PUT", "/api/admin/feature-endpoints/editor_chat", {
        provider: "local",
        apiUrl: fakeProviderUrl,
        model: "endpoint-configured-model"
    });
    expect(configured.status).toBeLessThan(300);
}, 120_000);

afterAll(async () => {
    await server?.stop();
    await new Promise<void>(resolve => fakeProvider?.close(() => resolve()));
});

describe("server-side chat generation proxy (B45)", () => {
    it("streams the provider's tokens back as SSE", async () => {
        const response = await generate({ featureKey: "editor_chat" });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");

        const frames = await readSse(response);
        expect(frames.at(-1)).toBe("[DONE]");
        // The browser reassembles content from exactly these chunks.
        const text = frames
            .filter(f => f !== "[DONE]")
            .map(f => JSON.parse(f).choices?.[0]?.delta?.content ?? "")
            .join("");
        expect(text).toBe("hello world");
    });

    it("applies the feature endpoint's own apiUrl — the thing that never reached live chat before", async () => {
        forgetLastRequest();
        await generate({ featureKey: "editor_chat" });

        // Reaching the fake provider at all IS the assertion: nothing but the per-feature endpoint
        // could have pointed the request here.
        expect(seen.last).not.toBeNull();
        expect(seen.last?.path).toContain("/chat/completions");
    });

    it("keeps the chat's chosen model, never the endpoint's", async () => {
        // A per-feature endpoint supplies credentials, not the model — the per-chat model picker
        // is a deliberate user choice and has to survive. (The endpoint above says
        // "endpoint-configured-model".)
        forgetLastRequest();
        await generate({ featureKey: "editor_chat", model: "the-model-the-user-picked" });

        expect(seen.last?.body.model).toBe("the-model-the-user-picked");
    });

    it("strips the browser's `local/` model prefix before calling the provider", async () => {
        // Found in live verification, not by this suite's original tests, which only ever sent
        // clean ids: the browser namespaces local models as `local/<id>` for display, and the old
        // client-side path stripped that immediately before calling. A real model server rejects
        // "local/artemis-31b-…" as an unknown model.
        forgetLastRequest();
        await generate({ featureKey: "editor_chat", model: "local/artemis-31b-v1h-i1-gguf" });

        expect(seen.last?.body.model).toBe("artemis-31b-v1h-i1-gguf");
    });

    it("uses the global Local URL when no per-feature endpoint matches", async () => {
        // Also found live: with no featureKey (chat title generation is the real case), the
        // synthesised endpoint left apiUrl unset, so clientFromEndpoint fell back to its hardcoded
        // localhost:1234 and ignored a configured global Local URL entirely — a silent 502 for
        // anyone whose model server isn't on the default port.
        const settings = await server.api<{ id: string }>("GET", "/api/ai/settings");
        const updated = await server.api("PUT", `/api/ai/settings/${settings.body.id}`, {
            localApiUrl: fakeProviderUrl
        });
        expect(updated.status).toBeLessThan(300);

        forgetLastRequest();
        // No featureKey at all — the path that was broken.
        const response = await generate({ model: "some-local-model" });

        expect(response.status).toBe(200);
        expect(seen.last?.path).toContain("/chat/completions");
    });

    it("forwards temperature, max_tokens and the message array unchanged", async () => {
        forgetLastRequest();
        await generate({
            featureKey: "editor_chat",
            temperature: 0.4,
            maxTokens: 123,
            messages: [
                { role: "system", content: "a system prompt" },
                { role: "user", content: "a user turn" }
            ]
        });

        expect(seen.last?.body.temperature).toBe(0.4);
        expect(seen.last?.body.max_tokens).toBe(123);
        expect(seen.last?.body.messages).toEqual([
            { role: "system", content: "a system prompt" },
            { role: "user", content: "a user turn" }
        ]);
        expect(seen.last?.body.stream).toBe(true);
    });

    it("reports an upstream failure as a real status, not a 200 with an error in the body", async () => {
        // B14's lesson: a failure that arrives dressed as a success is worse than an error. The
        // headers haven't gone out yet at this point, so a genuine status code is still possible.
        const previous = respond;
        respond = () => ({ status: 401, json: { error: { message: "Invalid API key" } } });

        const response = await generate({ featureKey: "editor_chat" });
        expect(response.status).toBe(401);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain("Invalid API key");

        respond = previous;
    });

    it("rejects a malformed request instead of forwarding it", async () => {
        const badProvider = await server.fetch("/api/ai-chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "not-a-provider", model: "m", messages: [{ role: "user", content: "hi" }] })
        });
        expect(badProvider.status).toBe(400);

        const noMessages = await server.fetch("/api/ai-chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "local", model: "m", messages: [] })
        });
        expect(noMessages.status).toBe(400);

        // grok-session is deliberately not proxied — it must be refused here, not half-handled.
        const sessionProvider = await server.fetch("/api/ai-chat/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: "grok-session",
                model: "m",
                messages: [{ role: "user", content: "hi" }]
            })
        });
        expect(sessionProvider.status).toBe(400);
    });

    it("requires a session — generation is not an unauthenticated endpoint", async () => {
        const response = await fetch(`${server.baseUrl}/api/ai-chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "local", model: "m", messages: [{ role: "user", content: "hi" }] })
        });
        expect(response.status).toBe(401);
    });
});
