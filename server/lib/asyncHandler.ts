import { attemptPromise } from "@jfdi/attempt";
import type { Request, Response } from "express";

// Shared error-catching wrapper for route handlers that need to catch their own errors (send a
// custom status/body) instead of relying on server/index.ts's global error middleware.
//
// B12 (docs/BUGS_2026-08-19.md) — this used to be duplicated near-identically across ~8 route
// files (ai.ts, autoHumanizer.ts, grammar.ts, humanizer.ts, tts.ts, series.ts, chats.ts, codex.ts),
// each logging its catch under a different, route-specific label ("Error:", "Chat error:", "Codex
// error:", ...) — none of which matched the global error middleware's "Server error:" prefix. That
// meant a genuine 500 thrown by any of these routes was invisible to a log search for "Server
// error", the exact debugging approach a prior B12 investigation pass relied on and came up empty
// with. Consolidated into one implementation that logs under the same "Server error:" prefix the
// global middleware uses (plus method/path for context), so both paths are greppable the same way.
//
// auth.ts and users.ts intentionally keep their own local handler — they return 400 with a
// different fallback message ("Request failed") for what are validation errors, not server
// errors, a deliberate distinction this helper doesn't cover.
export const asyncHandler =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
        const [error] = await attemptPromise(() => fn(req, res));
        if (error) {
            console.error("Server error:", `[${req.method} ${req.originalUrl}]`, error);
            res.status(500).json({ error: error.message || "Server error" });
        }
    };
