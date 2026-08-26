import { eq, lt, ne } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export type UserRow = typeof schema.users.$inferSelect;
export type SessionRow = typeof schema.sessions.$inferSelect;

// ── Users ──────────────────────────────────────────────────────────────────────

export const getUserCount = async (): Promise<number> => {
    const rows = await db.select({ id: schema.users.id }).from(schema.users);
    return rows.length;
};

export const getUserByUsername = async (username: string): Promise<UserRow | null> => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return row ?? null;
};

export const getUserById = async (id: string): Promise<UserRow | null> => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return row ?? null;
};

export const createUser = async (params: {
    username: string;
    passwordHash: string;
    role: "owner" | "editor" | "viewer";
}): Promise<UserRow> => {
    const [row] = await db
        .insert(schema.users)
        .values({
            id: crypto.randomUUID(),
            username: params.username,
            passwordHash: params.passwordHash,
            role: params.role,
            createdAt: new Date()
        })
        .returning();
    return row;
};

export const getAllUsers = async (): Promise<UserRow[]> => db.select().from(schema.users);

export const updateUser = async (
    id: string,
    changes: Partial<Pick<UserRow, "role" | "isActive" | "passwordHash" | "onboardingTourCompleted">>
): Promise<UserRow | null> => {
    const [row] = await db.update(schema.users).set(changes).where(eq(schema.users.id, id)).returning();
    return row ?? null;
};

// ── Sessions ───────────────────────────────────────────────────────────────────

export const createSession = async (params: {
    hashedToken: string;
    userId: string;
    expiresAt: Date;
    remoteProfile: boolean;
}): Promise<SessionRow> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.sessions)
        .values({
            id: params.hashedToken,
            userId: params.userId,
            createdAt: now,
            expiresAt: params.expiresAt,
            lastSeenAt: now,
            remoteProfile: params.remoteProfile
        })
        .returning();
    return row;
};

export const getSession = async (hashedToken: string): Promise<SessionRow | null> => {
    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, hashedToken));
    return row ?? null;
};

export const deleteSession = async (hashedToken: string): Promise<void> => {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hashedToken));
};

// RF3 idle throttle-touch — called at most once/minute per session from validateSession, not on
// every authenticated request, so this doesn't turn every API call into a session-table write.
export const touchSessionLastSeen = async (hashedToken: string, lastSeenAt: Date): Promise<void> => {
    await db.update(schema.sessions).set({ lastSeenAt }).where(eq(schema.sessions.id, hashedToken));
};

// RF3 sidebar Remote toggle — flips ONE session (the browser that clicked it), not every session
// for the user, since this declares "this browser is less trusted," not "this account is."
export const updateSessionRemoteProfile = async (
    hashedToken: string,
    changes: { remoteProfile: boolean; expiresAt: Date; lastSeenAt: Date }
): Promise<SessionRow | null> => {
    const [row] = await db.update(schema.sessions).set(changes).where(eq(schema.sessions.id, hashedToken)).returning();
    return row ?? null;
};

export const deleteSessionsForUser = async (userId: string): Promise<void> => {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
};

// Opportunistic cleanup — called on login rather than on a timer, since this is a
// single/small-user local app with no background job runner.
export const deleteExpiredSessions = async (): Promise<void> => {
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
};

// RF2 (docs/Remote_Access_Funnel_Design.md §6) — "Revoke all sessions". `exceptHashedToken` keeps
// the caller's own current session alive (they're the one clicking the button on a trusted
// device) — pass null to nuke every session with no exception.
export const deleteAllSessionsExcept = async (exceptHashedToken: string | null): Promise<number> => {
    const rows = exceptHashedToken
        ? await db.delete(schema.sessions).where(ne(schema.sessions.id, exceptHashedToken)).returning({ id: schema.sessions.id })
        : await db.delete(schema.sessions).returning({ id: schema.sessions.id });
    return rows.length;
};

// ── Login attempts (RF1 durable lockout) ────────────────────────────────────────

export type LoginAttemptRow = typeof schema.loginAttempts.$inferSelect;

export const getLoginAttempt = async (key: string): Promise<LoginAttemptRow | null> => {
    const [row] = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.key, key));
    return row ?? null;
};

// Plain select-then-insert-or-update (same idiom as the get-or-create-singleton services) rather
// than a drizzle onConflictDoUpdate — a rare race here just means an undercounted attempt or two,
// not a correctness issue worth extra machinery for a security throttle, not a ledger.
export const upsertLoginAttempt = async (
    key: string,
    changes: { failedCount: number; lockedUntil: Date | null }
): Promise<void> => {
    const existing = await getLoginAttempt(key);
    if (existing)
        await db
            .update(schema.loginAttempts)
            .set({ ...changes, updatedAt: new Date() })
            .where(eq(schema.loginAttempts.key, key));
    else await db.insert(schema.loginAttempts).values({ key, ...changes, updatedAt: new Date() });
};

export const deleteLoginAttempt = async (key: string): Promise<void> => {
    await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, key));
};

// Bounds table growth — piggybacks on pruneHistoryJob.ts's existing daily cadence, same precedent
// as Transfer Log / Trash pruning there. A row this old is either a long-expired lockout nobody
// ever revisited, or a handful of stale failed attempts that never reached the threshold.
export const deleteStaleLoginAttempts = async (cutoff: Date): Promise<number> => {
    const rows = await db
        .delete(schema.loginAttempts)
        .where(lt(schema.loginAttempts.updatedAt, cutoff))
        .returning({ key: schema.loginAttempts.key });
    return rows.length;
};
