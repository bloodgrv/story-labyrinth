import { attemptPromise } from "@jfdi/attempt";
import { type Request, type Response, Router } from "express";
import { readCookie, SESSION_COOKIE_NAME } from "../middleware/auth.js";
import {
    adminResetPassword,
    createUserByAdmin,
    listUsers,
    revokeAllSessions,
    setUserActive,
    updateUserRole,
    type UserRole
} from "../services/authService.js";
import { getInstanceLabel, setInstanceLabel } from "../services/installSettingsService.js";

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    const [error] = await attemptPromise(() => fn(req, res));
    if (error) {
        console.error("Users error:", error);
        res.status(400).json({ error: error.message || "Request failed" });
    }
};

const isUserRole = (value: unknown): value is UserRole => value === "owner" || value === "editor" || value === "viewer";

// GET /api/users — list all local accounts. Mounted owner-only in server/index.ts.
router.get(
    "/",
    asyncHandler(async (_req, res) => {
        res.json(await listUsers());
    })
);

// POST /api/users — create a new account. Body: { username, password, role }
router.post(
    "/",
    asyncHandler(async (req, res) => {
        const { username, password, role } = req.body as { username?: string; password?: string; role?: string };
        if (typeof username !== "string" || typeof password !== "string" || !isUserRole(role)) {
            res.status(400).json({ error: "username, password, and a valid role are required" });
            return;
        }

        const user = await createUserByAdmin(username, password, role);
        res.status(201).json(user);
    })
);

// PATCH /api/users/:id/role — Body: { role }
router.patch(
    "/:id/role",
    asyncHandler(async (req, res) => {
        const { role } = req.body as { role?: string };
        if (!isUserRole(role)) {
            res.status(400).json({ error: "a valid role is required" });
            return;
        }

        res.json(await updateUserRole(req.params.id, role));
    })
);

// PATCH /api/users/:id/active — Body: { isActive }
router.patch(
    "/:id/active",
    asyncHandler(async (req, res) => {
        const { isActive } = req.body as { isActive?: boolean };
        if (typeof isActive !== "boolean") {
            res.status(400).json({ error: "isActive (boolean) is required" });
            return;
        }

        res.json(await setUserActive(req.params.id, isActive));
    })
);

// POST /api/users/:id/reset-password — Body: { newPassword }
router.post(
    "/:id/reset-password",
    asyncHandler(async (req, res) => {
        const { newPassword } = req.body as { newPassword?: string };
        if (typeof newPassword !== "string") {
            res.status(400).json({ error: "newPassword is required" });
            return;
        }

        res.json(await adminResetPassword(req.params.id, newPassword));
    })
);

// POST /api/users/revoke-all-sessions — RF2 (docs/Remote_Access_Funnel_Design.md §6). Owner-only
// (mounted requireOwner in server/index.ts, same as every other route on this router). Kills
// every OTHER session across every account — a stolen/work-PC cookie recovery lever that doesn't
// require a password reset — while keeping the caller's own current session alive.
router.post(
    "/revoke-all-sessions",
    asyncHandler(async (req, res) => {
        const currentToken = readCookie(req, SESSION_COOKIE_NAME);
        const revoked = await revokeAllSessions(currentToken);
        res.json({ revoked });
    })
);

// GET/PATCH /api/users/instance-label — Remote Access login instance label (RF5). Owner-only,
// matching every other route on this router (mounted requireOwner in server/index.ts). Body: { label }
router.get(
    "/instance-label",
    asyncHandler(async (_req, res) => {
        res.json({ instanceLabel: await getInstanceLabel() });
    })
);

router.patch(
    "/instance-label",
    asyncHandler(async (req, res) => {
        const { label } = req.body as { label?: string };
        if (typeof label !== "string") {
            res.status(400).json({ error: "label (string) is required" });
            return;
        }

        res.json({ instanceLabel: await setInstanceLabel(label) });
    })
);

export default router;
