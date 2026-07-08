import { eq, lt } from "drizzle-orm";
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
    changes: Partial<Pick<UserRow, "role" | "isActive" | "passwordHash">>
): Promise<UserRow | null> => {
    const [row] = await db.update(schema.users).set(changes).where(eq(schema.users.id, id)).returning();
    return row ?? null;
};

// ── Sessions ───────────────────────────────────────────────────────────────────

export const createSession = async (params: {
    hashedToken: string;
    userId: string;
    expiresAt: Date;
}): Promise<SessionRow> => {
    const [row] = await db
        .insert(schema.sessions)
        .values({
            id: params.hashedToken,
            userId: params.userId,
            createdAt: new Date(),
            expiresAt: params.expiresAt
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

export const deleteSessionsForUser = async (userId: string): Promise<void> => {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
};

// Opportunistic cleanup — called on login rather than on a timer, since this is a
// single/small-user local app with no background job runner.
export const deleteExpiredSessions = async (): Promise<void> => {
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
};
