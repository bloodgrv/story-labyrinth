import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwordService.js";
import {
    createSession,
    createUser,
    deleteExpiredSessions,
    deleteSession,
    deleteSessionsForUser,
    getAllUsers,
    getSession,
    getUserById,
    getUserByUsername,
    getUserCount,
    updateUser,
    type UserRow
} from "./authRepository.js";

export type UserRole = "owner" | "editor" | "viewer";
export type AuthUser = { id: string; username: string; role: UserRole; isActive: boolean };
export type AuthSession = { rawToken: string; expiresAt: Date };

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a personal/local tool, not a bank
const SESSION_TOKEN_BYTES = 32;

const toAuthUser = (row: UserRow): AuthUser => ({
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    isActive: row.isActive
});

// ── Session tokens ─────────────────────────────────────────────────────────────
// The raw token goes in the cookie; only its SHA-256 hash is ever persisted (see
// schema.ts's `sessions` table comment) so a DB dump can't be replayed directly.

const hashToken = (rawToken: string): string => createHash("sha256").update(rawToken).digest("hex");

const issueSession = async (userId: string): Promise<AuthSession> => {
    const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await createSession({ hashedToken: hashToken(rawToken), userId, expiresAt });
    return { rawToken, expiresAt };
};

export const validateSession = async (rawToken: string): Promise<AuthUser | null> => {
    const session = await getSession(hashToken(rawToken));
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
        await deleteSession(session.id);
        return null;
    }

    const user = await getUserById(session.userId);
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
};

export const endSession = async (rawToken: string): Promise<void> => {
    await deleteSession(hashToken(rawToken));
};

// ── Login attempt rate limiting ─────────────────────────────────────────────────
// In-memory only (not persisted) — this is a defense-in-depth measure against brute
// force, not the sole protection, and doesn't need to survive a server restart.

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptState = { failedCount: number; lockedUntil: number | null };
const loginAttempts = new Map<string, AttemptState>();

const getLockoutRemainingMs = (username: string): number => {
    const state = loginAttempts.get(username.toLowerCase());
    if (!state?.lockedUntil) return 0;
    return Math.max(0, state.lockedUntil - Date.now());
};

const recordFailedAttempt = (username: string): void => {
    const key = username.toLowerCase();
    const state = loginAttempts.get(key) ?? { failedCount: 0, lockedUntil: null };
    state.failedCount += 1;
    if (state.failedCount >= MAX_FAILED_ATTEMPTS) {
        state.lockedUntil = Date.now() + LOCKOUT_MS;
        state.failedCount = 0;
    }
    loginAttempts.set(key, state);
};

const clearAttempts = (username: string): void => {
    loginAttempts.delete(username.toLowerCase());
};

// ── Validation ─────────────────────────────────────────────────────────────────

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;
const MIN_PASSWORD_LENGTH = 8;

export const validateUsername = (username: string): string | null => {
    if (!USERNAME_PATTERN.test(username))
        return "Username must be 3-64 characters: letters, numbers, underscore, or hyphen only.";
    return null;
};

export const validatePassword = (password: string): string | null => {
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    return null;
};

// ── Public API ─────────────────────────────────────────────────────────────────

export const isSetupComplete = async (): Promise<boolean> => (await getUserCount()) > 0;

/**
 * Register the first (and, in this phase, only) local account. Callers must check
 * isSetupComplete() themselves and refuse if it's already true — kept as a separate
 * check at the route layer so the 403 "registration closed" response is explicit there.
 */
export const registerUser = async (
    username: string,
    password: string
): Promise<{ user: AuthUser; session: AuthSession }> => {
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);
    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const existing = await getUserByUsername(username);
    if (existing) throw new Error("Username is already taken.");

    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, passwordHash, role: "owner" });
    const session = await issueSession(user.id);

    return { user: toAuthUser(user), session };
};

/**
 * Verify credentials and start a session. Returns null on any failure (unknown username,
 * wrong password, or currently locked out) — deliberately without distinguishing which,
 * so failed logins don't reveal whether a username exists.
 */
export const login = async (username: string, password: string): Promise<{ user: AuthUser; session: AuthSession } | null> => {
    await deleteExpiredSessions();

    if (getLockoutRemainingMs(username) > 0) return null;

    const user = await getUserByUsername(username);
    if (!user) {
        // Still hash something to keep timing roughly consistent with the "user exists"
        // path, rather than returning near-instantly for unknown usernames.
        await hashPassword(password);
        recordFailedAttempt(username);
        return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid || !user.isActive) {
        recordFailedAttempt(username);
        return null;
    }

    clearAttempts(username);
    const session = await issueSession(user.id);
    return { user: toAuthUser(user), session };
};

export const getLoginLockoutSeconds = (username: string): number => Math.ceil(getLockoutRemainingMs(username) / 1000);

// ── Admin user management (owner-only, enforced at the route layer) ────────────────────

export const listUsers = async (): Promise<AuthUser[]> => (await getAllUsers()).map(toAuthUser);

export const createUserByAdmin = async (
    username: string,
    password: string,
    role: UserRole
): Promise<AuthUser> => {
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);
    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const existing = await getUserByUsername(username);
    if (existing) throw new Error("Username is already taken.");

    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, passwordHash, role });
    return toAuthUser(user);
};

// B35 (docs/CODE_REVIEW_2026-08-17.md) — with no other active owner, demoting or deactivating the
// last one locks every admin action (owner management, AI/TTS settings, etc.) behind a role no
// account can reach anymore, recoverable only by editing the DB directly. Simple check-then-act,
// not wrapped in a transaction like B25's approve-TOCTOU fixes — this is a rare, admin-only,
// human-paced action (not a hot concurrent path), so the same atomicity investment isn't
// proportionate here; a race would need two admins simultaneously demoting different owners down
// to the exact same last one, an extremely low-probability scenario for this app's threat model.
const countOtherActiveOwners = async (excludeUserId: string): Promise<number> =>
    (await getAllUsers()).filter(u => u.role === "owner" && u.isActive && u.id !== excludeUserId).length;

export const updateUserRole = async (id: string, role: UserRole): Promise<AuthUser> => {
    const existing = await getUserById(id);
    if (!existing) throw new Error("User not found.");
    if (existing.role === "owner" && existing.isActive && role !== "owner" && (await countOtherActiveOwners(id)) === 0)
        throw new Error("Can't change the role of the last active owner — promote another user to owner first.");

    const user = await updateUser(id, { role });
    if (!user) throw new Error("User not found.");
    return toAuthUser(user);
};

export const setUserActive = async (id: string, isActive: boolean): Promise<AuthUser> => {
    if (!isActive) {
        const existing = await getUserById(id);
        if (existing?.role === "owner" && existing.isActive && (await countOtherActiveOwners(id)) === 0)
            throw new Error("Can't deactivate the last active owner — promote another user to owner first.");
    }

    const user = await updateUser(id, { isActive });
    if (!user) throw new Error("User not found.");
    if (!isActive) await deleteSessionsForUser(id);
    return toAuthUser(user);
};

export const adminResetPassword = async (id: string, newPassword: string): Promise<AuthUser> => {
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw new Error(passwordError);

    const passwordHash = await hashPassword(newPassword);
    const user = await updateUser(id, { passwordHash });
    if (!user) throw new Error("User not found.");
    await deleteSessionsForUser(id);
    return toAuthUser(user);
};
