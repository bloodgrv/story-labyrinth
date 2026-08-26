import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "./passwordService.js";
import {
    createSession,
    createUser,
    deleteAllSessionsExcept,
    deleteExpiredSessions,
    deleteLoginAttempt,
    deleteSession,
    deleteSessionsForUser,
    getAllUsers,
    getLoginAttempt,
    getSession,
    getUserById,
    getUserByUsername,
    getUserCount,
    touchSessionLastSeen,
    updateSessionRemoteProfile,
    updateUser,
    upsertLoginAttempt,
    type UserRow
} from "./authRepository.js";

export type UserRole = "owner" | "editor" | "viewer";
export type AuthUser = { id: string; username: string; role: UserRole; isActive: boolean; onboardingTourCompleted: boolean };
export type AuthSession = { rawToken: string; expiresAt: Date };

// Remote Access — RF3 (docs/Remote_Access_Funnel_Design.md §5). Two absolute-lifetime profiles
// per session (not per account) — LOCAL is this app's long-standing default for a personal/local
// tool, not a bank; REMOTE is the stricter policy the sidebar toggle opts one browser into.
const LOCAL_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REMOTE_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day
const REMOTE_IDLE_MS = 60 * 60 * 1000; // 1 hour sliding idle — remote profile only
const LAST_SEEN_TOUCH_THROTTLE_MS = 60 * 1000; // avoid a session-table write on every single request
const SESSION_TOKEN_BYTES = 32;

const toAuthUser = (row: UserRow): AuthUser => ({
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    isActive: row.isActive,
    onboardingTourCompleted: row.onboardingTourCompleted
});

// ── Session tokens ─────────────────────────────────────────────────────────────
// The raw token goes in the cookie; only its SHA-256 hash is ever persisted (see
// schema.ts's `sessions` table comment) so a DB dump can't be replayed directly.

const hashToken = (rawToken: string): string => createHash("sha256").update(rawToken).digest("hex");

const issueSession = async (userId: string): Promise<AuthSession> => {
    const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
    // Optional env default (RF3 design §5) — new logins start remote-profiled on an always-on
    // Funnel host. The sidebar toggle can still flip this off per session afterward.
    const remoteProfile = process.env.REMOTE_SESSION_DEFAULT === "1";
    const expiresAt = new Date(Date.now() + (remoteProfile ? REMOTE_SESSION_DURATION_MS : LOCAL_SESSION_DURATION_MS));
    await createSession({ hashedToken: hashToken(rawToken), userId, expiresAt, remoteProfile });
    return { rawToken, expiresAt };
};

export const validateSession = async (rawToken: string): Promise<AuthUser | null> => {
    const hashedToken = hashToken(rawToken);
    const session = await getSession(hashedToken);
    if (!session) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
        await deleteSession(session.id);
        return null;
    }

    // RF3 idle enforcement — remote-profile sessions only; the local/default profile has no idle
    // timeout (design §5's own lock: "off = current 30d/no idle"). `lastSeenAt` falls back to
    // `createdAt` only for a session created before this column existed.
    if (session.remoteProfile) {
        const lastSeenMs = (session.lastSeenAt ?? session.createdAt).getTime();
        if (now - lastSeenMs > REMOTE_IDLE_MS) {
            await deleteSession(session.id);
            return null;
        }
        if (now - lastSeenMs > LAST_SEEN_TOUCH_THROTTLE_MS) await touchSessionLastSeen(session.id, new Date(now));
    }

    const user = await getUserById(session.userId);
    if (!user || !user.isActive) return null;
    return toAuthUser(user);
};

export const endSession = async (rawToken: string): Promise<void> => {
    await deleteSession(hashToken(rawToken));
};

// RF3 — read-only session metadata for GET /api/auth/status's UI hook (remoteProfile so the
// sidebar toggle can render its current on/off state). Deliberately separate from validateSession
// rather than widening that function's return shape, since requireAuth's callers only need AuthUser.
export const getSessionRemoteInfo = async (rawToken: string): Promise<{ remoteProfile: boolean; expiresAt: Date } | null> => {
    const session = await getSession(hashToken(rawToken));
    if (!session) return null;
    return { remoteProfile: session.remoteProfile, expiresAt: session.expiresAt };
};

// RF3 sidebar Remote toggle — self-service, flips ONE session (this browser), not every session
// for the account. Turning ON rebases the absolute ceiling to exactly now+1day (never longer,
// satisfying the design's "expiresAt = min(existing, remoteArmedAt + 1 day)" ceiling by
// construction) and resets the idle clock; turning OFF returns to the local 30-day ceiling and
// idle enforcement stops (remoteProfile=false skips the idle branch above entirely).
export const setRemoteSession = async (
    rawToken: string,
    enabled: boolean
): Promise<{ remoteProfile: boolean; expiresAt: Date } | null> => {
    const hashedToken = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (enabled ? REMOTE_SESSION_DURATION_MS : LOCAL_SESSION_DURATION_MS));
    const updated = await updateSessionRemoteProfile(hashedToken, { remoteProfile: enabled, expiresAt, lastSeenAt: now });
    if (!updated) return null;
    return { remoteProfile: updated.remoteProfile, expiresAt: updated.expiresAt };
};

// RF2 (docs/Remote_Access_Funnel_Design.md §6) — owner "Revoke all sessions": recovers a
// stolen/left-behind (e.g. work PC) cookie without a password reset, which was previously the
// only lever (adminResetPassword already calls deleteSessionsForUser, but only for the one
// account being reset). Keeps the caller's own current session alive — the owner is presumably
// clicking this from a trusted device and shouldn't be logged out by their own click.
export const revokeAllSessions = async (currentRawToken?: string | null): Promise<number> =>
    deleteAllSessionsExcept(currentRawToken ? hashToken(currentRawToken) : null);

// ── Login attempt rate limiting (RF1) ───────────────────────────────────────────
// Durable (server/db/schema.ts's loginAttempts table) rather than the old in-memory-only
// Map — a burst of failed logins right before a restart (crash, update, manual bounce) used
// to wipe the lockout for free, exactly the gap docs/Remote_Access_Funnel_Design.md's RF1
// names. Two independent scopes share the same table/mechanism: a tight per-username lockout
// (unchanged threshold from the old in-memory version) plus a coarser per-IP throttle — the
// IP throttle catches a single source hammering many different usernames, which the
// per-username lockout alone can't. `ip` comes from Express's own `req.ip` (no `trust proxy`
// configured — see routes/auth.ts) — behind a reverse proxy that doesn't forward the real
// client address this degrades to a coarse global throttle, which is the explicitly-allowed
// "IP (or coarse)" fallback in the design doc, not a bug.

const MAX_FAILED_ATTEMPTS_PER_USERNAME = 5;
const MAX_FAILED_ATTEMPTS_PER_IP = 20;
const LOCKOUT_MS = 15 * 60 * 1000;

const usernameKey = (username: string): string => `user:${username.toLowerCase()}`;
const ipKey = (ip: string): string => `ip:${ip}`;

const getLockoutRemainingMs = async (key: string): Promise<number> => {
    const row = await getLoginAttempt(key);
    if (!row?.lockedUntil) return 0;
    return Math.max(0, row.lockedUntil.getTime() - Date.now());
};

const recordFailedAttempt = async (key: string, maxAttempts: number): Promise<void> => {
    const row = await getLoginAttempt(key);
    const failedCount = (row?.failedCount ?? 0) + 1;
    const lockedUntil = failedCount >= maxAttempts ? new Date(Date.now() + LOCKOUT_MS) : (row?.lockedUntil ?? null);
    await upsertLoginAttempt(key, { failedCount: failedCount >= maxAttempts ? 0 : failedCount, lockedUntil });
};

const clearAttempts = async (key: string): Promise<void> => {
    await deleteLoginAttempt(key);
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
 * so failed logins don't reveal whether a username exists. `ip` is optional (RF1's per-IP
 * throttle is skipped, not fatal, if the caller has no address to give it).
 */
export const login = async (
    username: string,
    password: string,
    ip?: string | null
): Promise<{ user: AuthUser; session: AuthSession } | null> => {
    await deleteExpiredSessions();

    const uKey = usernameKey(username);
    const iKey = ip ? ipKey(ip) : null;

    if ((await getLockoutRemainingMs(uKey)) > 0) return null;
    if (iKey && (await getLockoutRemainingMs(iKey)) > 0) return null;

    const user = await getUserByUsername(username);
    if (!user) {
        // Still hash something to keep timing roughly consistent with the "user exists"
        // path, rather than returning near-instantly for unknown usernames.
        await hashPassword(password);
        await recordFailedAttempt(uKey, MAX_FAILED_ATTEMPTS_PER_USERNAME);
        if (iKey) await recordFailedAttempt(iKey, MAX_FAILED_ATTEMPTS_PER_IP);
        return null;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid || !user.isActive) {
        await recordFailedAttempt(uKey, MAX_FAILED_ATTEMPTS_PER_USERNAME);
        if (iKey) await recordFailedAttempt(iKey, MAX_FAILED_ATTEMPTS_PER_IP);
        return null;
    }

    await clearAttempts(uKey);
    if (iKey) await clearAttempts(iKey);
    const session = await issueSession(user.id);
    return { user: toAuthUser(user), session };
};

// Reports whichever of the two scopes (username / IP) is locked for longer, so the client's
// "try again in Ns" message reflects the real wait rather than just the username half.
export const getLoginLockoutSeconds = async (username: string, ip?: string | null): Promise<number> => {
    const uMs = await getLockoutRemainingMs(usernameKey(username));
    const iMs = ip ? await getLockoutRemainingMs(ipKey(ip)) : 0;
    return Math.ceil(Math.max(uMs, iMs) / 1000);
};

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

// First-Start Tour (T11) — self-service, any authenticated role (only owners ever auto-start
// the tour, but Replay is open to any role that can open Guide, and Skip/Finish from a replay
// still needs somewhere to write). Never called with `false` — Replay intentionally never
// re-arms auto-start (design §4's "Replay does not set completed back to false").
export const setOnboardingTourCompleted = async (id: string, completed: boolean): Promise<AuthUser> => {
    const user = await updateUser(id, { onboardingTourCompleted: completed });
    if (!user) throw new Error("User not found.");
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
