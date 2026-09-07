import { Router } from "express";
import { z } from "zod";
import { buildChatClient } from "../services/aiClientFactory.js";
import { FEATURE_KEYS, type FeatureKey } from "../../src/types/aiSettings.js";

// B45 (docs/HEALTH_REVIEW_2026-09-06.md's H1) — server-side streaming proxy for live chat.
//
// Before this, live chat generation ran entirely in the browser: AIService.ts read the raw
// provider keys out of GET /api/ai/settings and called OpenAI/OpenRouter/Grok/Gemini directly.
// That single split was the root cause of three separately-logged items — B32's "architecturally
// unfixable" key exposure, B13's parked per-feature apiUrl/apiKey residual, and the remote-access
// gap where a browser on another machine had to reach the model host itself.
//
// Deliberately NOT mounted under /api/ai (which is requireOwner): generating is ordinary editor
// work, not settings administration. It sits at the router-level editor auth in index.ts, where
// blockViewerMutations already stops viewers from POSTing.
//
// The response is an OpenAI-style SSE stream, byte-for-byte what the browser used to receive
// straight from the provider — so the entire client-side consumption path (handleStreamedResponse,
// processStreamedResponse, usage capture, the 204-on-abort convention) is unchanged.

const router = Router();

// Providers this route can build a client for. "grok-session" is absent on purpose: it
// authenticates with a raw session cookie and has no OpenAI-compatible client in
// aiClientFactory, so it stays on the browser path for now (a follow-up on B45's row).
const PROXIED_PROVIDERS = ["openai", "openrouter", "deepseek", "gemini", "grok", "grok-oauth", "local"] as const;

const requestSchema = z
    .object({
        provider: z.enum(PROXIED_PROVIDERS),
        model: z.string().min(1),
        messages: z
            .array(
                z
                    .object({
                        role: z.enum(["system", "user", "assistant"]),
                        content: z.string()
                    })
                    .strict()
            )
            .min(1),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().optional(),
        // Which Feature Routing row this chat belongs to, so a matching per-feature endpoint's
        // apiUrl/apiKey can apply. Absent for non-desk generations (e.g. chat title generation).
        featureKey: z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]).optional()
    })
    .strict();

// POST /api/ai-chat/stream — Server-Sent Events, OpenAI chunk format.
router.post("/stream", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid generation request", details: parsed.error.issues });
        return;
    }
    const { provider, model, messages, temperature, maxTokens, featureKey } = parsed.data;

    // Abort the upstream request when the browser goes away (navigation, tab close, or the user
    // pressing stop — AIService aborts its fetch, which closes this socket). Without this, a
    // cancelled generation would keep streaming tokens from a paid provider into nothing.
    const upstreamAbort = new AbortController();
    res.on("close", () => upstreamAbort.abort());

    try {
        const { client, model: resolvedModel } = await buildChatClient(provider, model, featureKey);

        const stream = await client.chat.completions.create(
            {
                model: resolvedModel,
                messages,
                temperature: temperature ?? 1.0,
                max_tokens: maxTokens,
                stream: true,
                // Context/Token Meter (T4) reads real usage off the final chunk when a provider
                // reports one. Requested for every provider now, not just local — one that doesn't
                // support it simply never emits the field, exactly as before.
                stream_options: { include_usage: true }
            },
            { signal: upstreamAbort.signal }
        );

        // Headers go out only once the provider has accepted the request, so an upstream failure
        // (bad key, unreachable local endpoint, unknown model) can still be reported as a real
        // HTTP error status instead of a 200 whose body is an error message.
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        // Nginx and friends buffer SSE into uselessness otherwise; harmless when nothing proxies.
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        for await (const chunk of stream) {
            if (res.writableEnded) break;
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        if (!res.writableEnded) {
            res.write("data: [DONE]\n\n");
            res.end();
        }
    } catch (error) {
        // An abort is the user's own stop button, not a failure worth reporting.
        if (upstreamAbort.signal.aborted) {
            if (!res.writableEnded) res.end();
            return;
        }

        const message = error instanceof Error ? error.message : "Generation failed";
        if (res.headersSent) {
            // Mid-stream failure: the client is already parsing SSE, so an error has to arrive as
            // a frame it understands rather than as a status code it can no longer see.
            // streamUtils.ts's processStreamedResponse surfaces `error` on a chunk via onError.
            if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
                res.end();
            }
            return;
        }
        // Status is preserved where the provider gave us one (a 504 from an unreachable local
        // endpoint reads very differently from a 401 on a bad key — see B14).
        const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 502;
        res.status(status).json({ error: message });
    }
});

export default router;
