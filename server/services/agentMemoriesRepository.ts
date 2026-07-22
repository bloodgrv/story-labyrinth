import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema, sqlite } from "../db/client.js";
import type {
    AgentMemory,
    AgentMemoryCategory,
    AgentMemoryCreatedBy,
    AgentMemoryEvidence,
    AgentMemoryStatus
} from "../../src/types/agentMemory.js";

// Same hybrid split agentJobsRepository.ts established: most operations are plain Drizzle, but
// the supersession transition (insert/activate a row + demote whichever row was previously
// "active" for the same memoryKey, atomically) goes through raw synchronous better-sqlite3 so
// nothing else in this single-threaded process can interleave between the check and the write.

// ── Row -> domain mapping ────────────────────────────────────────────────────────

const rowToMemory = (row: typeof schema.agentMemories.$inferSelect): AgentMemory => ({
    id: row.id,
    storyId: row.storyId ?? null,
    memoryKey: row.memoryKey,
    category: row.category as AgentMemoryCategory,
    title: row.title,
    body: row.body,
    status: row.status as AgentMemoryStatus,
    sourceJobId: row.sourceJobId ?? null,
    sourceScanId: row.sourceScanId ?? null,
    sourceEvidence: (row.sourceEvidence as AgentMemoryEvidence[] | null) ?? null,
    pinned: row.pinned,
    createdBy: row.createdBy as AgentMemoryCreatedBy,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date,
    approvedAt: (row.approvedAt as unknown as Date | null) ?? null
});

// For rows returned by raw better-sqlite3 — see agentJobsRepository.ts's identical note:
// Drizzle's `mode: "timestamp"` stores epoch SECONDS (mapToDriverValue does
// `Math.floor(date.getTime() / 1000)`), and raw SQL bypasses that conversion entirely, so every
// raw write/read here must do it by hand.
type RawMemoryRow = {
    id: string;
    storyId: string | null;
    memoryKey: string;
    category: string;
    title: string;
    body: string;
    status: string;
    sourceJobId: string | null;
    sourceScanId: string | null;
    sourceEvidence: string | null;
    pinned: number;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    approvedAt: number | null;
};

const parseJsonColumn = (value: string | null): unknown => (value === null ? null : JSON.parse(value));
const toEpochSeconds = (): number => Math.floor(Date.now() / 1000);
const fromEpochSeconds = (value: number): Date => new Date(value * 1000);

const rawRowToMemory = (row: RawMemoryRow): AgentMemory => ({
    id: row.id,
    storyId: row.storyId,
    memoryKey: row.memoryKey,
    category: row.category as AgentMemoryCategory,
    title: row.title,
    body: row.body,
    status: row.status as AgentMemoryStatus,
    sourceJobId: row.sourceJobId,
    sourceScanId: row.sourceScanId,
    sourceEvidence: parseJsonColumn(row.sourceEvidence) as AgentMemoryEvidence[] | null,
    pinned: row.pinned === 1,
    createdBy: row.createdBy as AgentMemoryCreatedBy,
    createdAt: fromEpochSeconds(row.createdAt),
    updatedAt: fromEpochSeconds(row.updatedAt),
    approvedAt: row.approvedAt === null ? null : fromEpochSeconds(row.approvedAt)
});

// Nulls compare as a single sentinel, same convention as agentJobsRepository.ts's NONE_SENTINEL,
// so a global (storyId: null) memory's key lookup is null-safe without denormalizing the column.
const NONE_SENTINEL = "__none__";

// ── Drizzle operations ────────────────────────────────────────────────────────────

export type CreatePendingParams = {
    storyId: string | null;
    memoryKey: string;
    category: AgentMemoryCategory;
    title: string;
    body: string;
    sourceJobId: string | null;
    sourceScanId: string | null;
    sourceEvidence: AgentMemoryEvidence[] | null;
};

// Always status: 'pending', createdBy: 'job' — used exclusively by distillMemoryJob.ts. Never
// indexed (pending memories must never have ragChunks — see agentMemoriesService.ts).
export const createPendingMemory = async (params: CreatePendingParams): Promise<AgentMemory> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.agentMemories)
        .values({
            id: randomUUID(),
            storyId: params.storyId,
            memoryKey: params.memoryKey,
            category: params.category,
            title: params.title,
            body: params.body,
            status: "pending",
            sourceJobId: params.sourceJobId,
            sourceScanId: params.sourceScanId,
            sourceEvidence: params.sourceEvidence,
            pinned: false,
            createdBy: "job",
            createdAt: now,
            updatedAt: now,
            approvedAt: null
        })
        .returning();
    return rowToMemory(row);
};

export const getMemory = async (id: string): Promise<AgentMemory | null> => {
    const [row] = await db.select().from(schema.agentMemories).where(eq(schema.agentMemories.id, id));
    return row ? rowToMemory(row) : null;
};

export const getActiveByMemoryKey = async (storyId: string | null, memoryKey: string): Promise<AgentMemory | null> => {
    const [row] = await db
        .select()
        .from(schema.agentMemories)
        .where(
            and(
                eq(schema.agentMemories.memoryKey, memoryKey),
                eq(schema.agentMemories.status, "active"),
                storyId === null ? isNull(schema.agentMemories.storyId) : eq(schema.agentMemories.storyId, storyId)
            )
        );
    return row ? rowToMemory(row) : null;
};

// `global: true` lists only storyId IS NULL rows (cross-project writer_pref browser, P1.1) —
// mutually exclusive with `storyId` in practice (the route only ever sends one or the other).
export type ListMemoriesParams = { storyId?: string; status?: AgentMemoryStatus; global?: boolean };

export const listMemories = async (params: ListMemoriesParams): Promise<AgentMemory[]> => {
    const conditions = [];
    if (params.global) conditions.push(isNull(schema.agentMemories.storyId));
    else if (params.storyId) conditions.push(eq(schema.agentMemories.storyId, params.storyId));
    if (params.status) conditions.push(eq(schema.agentMemories.status, params.status));

    const rows = await db
        .select()
        .from(schema.agentMemories)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.agentMemories.createdAt));
    return rows.map(rowToMemory);
};

// Pure status flip — mirrors rejectPendingChange exactly. Only valid from 'pending'; returns
// null otherwise (route maps that to 400/404).
export const rejectMemory = async (id: string): Promise<AgentMemory | null> => {
    const [existing] = await db.select().from(schema.agentMemories).where(eq(schema.agentMemories.id, id));
    if (!existing || existing.status !== "pending") return null;

    const [row] = await db
        .update(schema.agentMemories)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(schema.agentMemories.id, id))
        .returning();
    return rowToMemory(row);
};

export type ReviseMemoryFields = { title?: string; body?: string; category?: AgentMemoryCategory };

// Content edit while still 'pending' (edit-before-approve). Mirrors revisePendingChange's
// pending-only guard. Never touches the RAG index — pending memories are never indexed.
export const reviseMemory = async (id: string, fields: ReviseMemoryFields): Promise<AgentMemory | null> => {
    const [existing] = await db.select().from(schema.agentMemories).where(eq(schema.agentMemories.id, id));
    if (!existing || existing.status !== "pending") return null;
    if (Object.keys(fields).length === 0) return rowToMemory(existing);

    const [row] = await db
        .update(schema.agentMemories)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(schema.agentMemories.id, id))
        .returning();
    return rowToMemory(row);
};

// Content edit on an already-'active' memory (design doc §4.2B "on edit of an active memory").
// Same row/id/memoryKey — no supersession, no status change. Caller (agentMemoriesService.ts)
// re-indexes after this succeeds.
export const updateActiveMemoryContent = async (id: string, fields: ReviseMemoryFields): Promise<AgentMemory | null> => {
    const [existing] = await db.select().from(schema.agentMemories).where(eq(schema.agentMemories.id, id));
    if (!existing || existing.status !== "active") return null;
    if (Object.keys(fields).length === 0) return rowToMemory(existing);

    const [row] = await db
        .update(schema.agentMemories)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(schema.agentMemories.id, id))
        .returning();
    return rowToMemory(row);
};

export const setPinned = async (id: string, pinned: boolean): Promise<AgentMemory | null> => {
    const [row] = await db
        .update(schema.agentMemories)
        .set({ pinned, updatedAt: new Date() })
        .where(eq(schema.agentMemories.id, id))
        .returning();
    return row ? rowToMemory(row) : null;
};

export const deleteMemory = async (id: string): Promise<boolean> => {
    const rows = await db.delete(schema.agentMemories).where(eq(schema.agentMemories.id, id)).returning({ id: schema.agentMemories.id });
    return rows.length > 0;
};

// ── Raw-SQL (atomic) operations ──────────────────────────────────────────────────

// Shared step used by both activation paths below: if an 'active' row already exists for this
// (storyId, memoryKey), flip it to 'superseded' inside the caller's transaction. Returns the
// superseded row (raw) or null if there was nothing to supersede.
const supersedeActiveForKey = (storyId: string | null, memoryKey: string, nowEpochSeconds: number): RawMemoryRow | null => {
    const existing = sqlite
        .prepare(
            `SELECT * FROM agentMemories
             WHERE COALESCE(storyId, ?) = COALESCE(?, ?) AND memoryKey = ? AND status = 'active'
             LIMIT 1`
        )
        .get(NONE_SENTINEL, storyId, NONE_SENTINEL, memoryKey) as RawMemoryRow | undefined;
    if (!existing) return null;

    return sqlite
        .prepare(`UPDATE agentMemories SET status = 'superseded', updatedAt = ? WHERE id = ? RETURNING *`)
        .get(nowEpochSeconds, existing.id) as RawMemoryRow;
};

// Approve: flips an existing 'pending' row to 'active' and, in the same transaction, supersedes
// whichever row was previously 'active' for the same memoryKey (design doc §4.4's "New approved
// memory with same memoryKey marks previous superseded"). Throws if the target isn't 'pending'
// (mirrors approvePendingChange's guard) — the service layer pre-checks status too, but this is
// the actual atomicity boundary.
export const activatePendingAndSupersede = (id: string): { activated: AgentMemory; superseded: AgentMemory | null } => {
    const tx = sqlite.transaction((): { activated: RawMemoryRow; superseded: RawMemoryRow | null } => {
        const pending = sqlite.prepare(`SELECT * FROM agentMemories WHERE id = ?`).get(id) as RawMemoryRow | undefined;
        if (!pending) throw new Error(`Memory not found: ${id}`);
        if (pending.status !== "pending") throw new Error(`Memory is already '${pending.status}'`);

        const now = toEpochSeconds();
        const superseded = supersedeActiveForKey(pending.storyId, pending.memoryKey, now);
        const activated = sqlite
            .prepare(`UPDATE agentMemories SET status = 'active', approvedAt = ?, updatedAt = ? WHERE id = ? RETURNING *`)
            .get(now, now, id) as RawMemoryRow;
        return { activated, superseded };
    });

    const { activated, superseded } = tx();
    return { activated: rawRowToMemory(activated), superseded: superseded ? rawRowToMemory(superseded) : null };
};

export type InsertActiveParams = {
    storyId: string | null;
    memoryKey: string;
    category: AgentMemoryCategory;
    title: string;
    body: string;
    pinned: boolean;
    createdBy: AgentMemoryCreatedBy;
};

// User-authored notes go active immediately (design doc §4.7 "prefer active for pure user
// notes") — but if the caller reuses an existing memoryKey, this still needs the same
// supersession guarantee as approve, since "latest approved wins for a key" applies regardless
// of who/what created the new row (design doc §4.4). Same transaction shape as
// activatePendingAndSupersede, just inserting a brand-new row instead of activating an existing
// pending one.
export const insertActiveAndSupersede = (params: InsertActiveParams): { activated: AgentMemory; superseded: AgentMemory | null } => {
    const tx = sqlite.transaction((): { activated: RawMemoryRow; superseded: RawMemoryRow | null } => {
        const now = toEpochSeconds();
        const superseded = supersedeActiveForKey(params.storyId, params.memoryKey, now);
        const activated = sqlite
            .prepare(
                `INSERT INTO agentMemories
                    (id, storyId, memoryKey, category, title, body, status, sourceJobId, sourceScanId, sourceEvidence, pinned, createdBy, createdAt, updatedAt, approvedAt)
                 VALUES
                    (@id, @storyId, @memoryKey, @category, @title, @body, 'active', NULL, NULL, NULL, @pinned, @createdBy, @now, @now, @now)
                 RETURNING *`
            )
            .get({
                id: randomUUID(),
                storyId: params.storyId,
                memoryKey: params.memoryKey,
                category: params.category,
                title: params.title,
                body: params.body,
                pinned: params.pinned ? 1 : 0,
                createdBy: params.createdBy,
                now
            }) as RawMemoryRow;
        return { activated, superseded };
    });

    const { activated, superseded } = tx();
    return { activated: rawRowToMemory(activated), superseded: superseded ? rawRowToMemory(superseded) : null };
};
