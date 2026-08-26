import { attemptPromise } from "@jfdi/attempt";
import { type Request, type Response, Router } from "express";
import { readCookie, requireAuth, sessionCookieOptions, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import {
    endSession,
    getLoginLockoutSeconds,
    getSessionRemoteInfo,
    isSetupComplete,
    login,
    registerUser,
    setOnboardingTourCompleted,
    setRemoteSession,
    validateSession
} from "../services/authService.js";
import { getInstanceLabel } from "../services/installSettingsService.js";

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    const [error] = await attemptPromise(() => fn(req, res));
    if (error) {
        console.error("Auth error:", error);
        res.status(400).json({ error: error.message || "Request failed" });
    }
};

// GET /api/auth/status — public. Tells the client whether to show a first-run "create
// account" form, a login form, or the app itself. Safe to call while logged out.
router.get(
    "/status",
    asyncHandler(async (req, res) => {
        const setupComplete = await isSetupComplete();

        const token = readCookie(req, SESSION_COOKIE_NAME);
        const user = token ? await validateSession(token) : null;
        // RF3 — only meaningful once `user` is non-null (validateSession above already dropped an
        // idle/expired remote session), so a second lookup can't resurrect a session already killed.
        const remoteInfo = user && token ? await getSessionRemoteInfo(token) : null;

        // Remote Access — Login Instance Label (RF5): public even while logged out, so the
        // login page itself can show it (the whole point is a "right server?" check before
        // typing a password) — never a username roster, just this one owner-set string.
        const instanceLabel = await getInstanceLabel();

        res.json({
            setupComplete,
            authenticated: !!user,
            username: user?.username ?? null,
            role: user?.role ?? null,
            // First-Start Tour (T11) — null while logged out, same posture as username/role above.
            onboardingTourCompleted: user?.onboardingTourCompleted ?? null,
            instanceLabel,
            // Remote Access — RF3 sidebar toggle state; null while logged out.
            remoteProfile: remoteInfo?.remoteProfile ?? null
        });
    })
);

// PATCH /api/auth/me/remote-session — RF3 sidebar Remote toggle. Self-service (requireAuth, no
// requireOwner) — any authenticated role can declare "this browser is less trusted." Body:
// { enabled: boolean }
router.patch(
    "/me/remote-session",
    requireAuth,
    asyncHandler(async (req, res) => {
        const { enabled } = req.body as { enabled?: boolean };
        if (typeof enabled !== "boolean") {
            res.status(400).json({ error: "enabled (boolean) is required" });
            return;
        }

        const token = readCookie(req, SESSION_COOKIE_NAME);
        if (!token) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        const result = await setRemoteSession(token, enabled);
        if (!result) {
            res.status(401).json({ error: "Session expired or invalid" });
            return;
        }

        res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(result.expiresAt.getTime() - Date.now()));
        res.json({ remoteProfile: result.remoteProfile, expiresAt: result.expiresAt });
    })
);

// PATCH /api/auth/me/onboarding-tour — self-service only (requireAuth, no requireOwner): any
// authenticated role can write their own flag, since Replay (T11 design §7) is open to any role
// that can open Guide, not just the owner who auto-starts. Body: { completed: boolean }
router.patch(
    "/me/onboarding-tour",
    requireAuth,
    asyncHandler(async (req, res) => {
        const { completed } = req.body as { completed?: boolean };
        if (typeof completed !== "boolean") {
            res.status(400).json({ error: "completed (boolean) is required" });
            return;
        }
        // requireAuth above guarantees req.authUser is set on every request that reaches here.
        if (!req.authUser) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        const user = await setOnboardingTourCompleted(req.authUser.id, completed);
        res.json({ onboardingTourCompleted: user.onboardingTourCompleted });
    })
);

// POST /api/auth/register — only allowed while no account exists yet (single-user bootstrap).
// Body: { username, password }
router.post(
    "/register",
    asyncHandler(async (req, res) => {
        if (await isSetupComplete()) {
            res.status(403).json({ error: "Registration is closed — an account already exists." });
            return;
        }

        const { username, password } = req.body as { username?: string; password?: string };
        if (typeof username !== "string" || typeof password !== "string") {
            res.status(400).json({ error: "username and password are required" });
            return;
        }

        const { user, session } = await registerUser(username, password);
        res.cookie(SESSION_COOKIE_NAME, session.rawToken, sessionCookieOptions(session.expiresAt.getTime() - Date.now()));
        res.status(201).json({ user });
    })
);

// POST /api/auth/login — Body: { username, password }
router.post(
    "/login",
    asyncHandler(async (req, res) => {
        const { username, password } = req.body as { username?: string; password?: string };
        if (typeof username !== "string" || typeof password !== "string") {
            res.status(400).json({ error: "username and password are required" });
            return;
        }

        const result = await login(username, password, req.ip);
        if (!result) {
            const lockoutSeconds = await getLoginLockoutSeconds(username, req.ip);
            if (lockoutSeconds > 0) {
                res.status(429).json({ error: `Too many failed attempts. Try again in ${lockoutSeconds}s.` });
                return;
            }
            res.status(401).json({ error: "Invalid username or password" });
            return;
        }

        res.cookie(
            SESSION_COOKIE_NAME,
            result.session.rawToken,
            sessionCookieOptions(result.session.expiresAt.getTime() - Date.now())
        );
        res.json({ user: result.user });
    })
);

// POST /api/auth/logout
router.post(
    "/logout",
    asyncHandler(async (req, res) => {
        const token = readCookie(req, SESSION_COOKIE_NAME);
        if (token) await endSession(token);
        res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
        res.json({ success: true });
    })
);

export default router;
