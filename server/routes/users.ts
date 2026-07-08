import { attemptPromise } from "@jfdi/attempt";
import { type Request, type Response, Router } from "express";
import {
    adminResetPassword,
    createUserByAdmin,
    listUsers,
    setUserActive,
    updateUserRole,
    type UserRole
} from "../services/authService.js";

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

export default router;
