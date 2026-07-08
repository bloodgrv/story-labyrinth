import type { NextFunction, Request, Response } from "express";
import { validateSession } from "../services/authService.js";

export const SESSION_COOKIE_NAME = "storynexus_session";

// Express only populates req.cookies when the `cookie-parser` middleware is installed.
// Rather than add that dependency for one header, parse the (single) cookie we care
// about directly from the raw Cookie header.
export const readCookie = (req: Request, name: string): string | null => {
    const header = req.headers.cookie;
    if (!header) return null;

    for (const pair of header.split(";")) {
        const separatorIndex = pair.indexOf("=");
        if (separatorIndex === -1) continue;
        const key = pair.slice(0, separatorIndex).trim();
        if (key === name) return decodeURIComponent(pair.slice(separatorIndex + 1).trim());
    }
    return null;
};

// secure defaults to false: this app's primary deployment target (per CLAUDE.md) is plain
// HTTP over a LAN or Tailscale tailnet, not a public HTTPS endpoint. Set COOKIE_SECURE=true
// for deployments that do terminate TLS in front of the app.
export const sessionCookieOptions = (maxAgeMs: number) => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: maxAgeMs,
    path: "/"
});

declare global {
    namespace Express {
        interface Request {
            authUser?: { id: string; username: string };
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = readCookie(req, SESSION_COOKIE_NAME);
    if (!token) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }

    const user = await validateSession(token);
    if (!user) {
        res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
        res.status(401).json({ error: "Session expired or invalid" });
        return;
    }

    req.authUser = user;
    next();
};
