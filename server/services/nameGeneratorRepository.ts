import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type {
    NameFavorite,
    NamePool,
    NamePoolGender,
    NamePoolKind,
    NamePoolLevel,
    NamePoolSource,
    NamePoolSummary,
    NamePoolTier,
    StoryNameDefaults,
    UsedName,
    UsedNameSource,
    UsedNameType
} from "../../src/types/nameGenerator.js";

// Pure DB access, no business logic — mirrors codexRepository.ts/agentMemoriesRepository.ts's
// split from their respective *Service.ts layers.

// ── Row -> domain mapping ────────────────────────────────────────────────────────

const rowToPool = (row: typeof schema.namePools.$inferSelect): NamePool => ({
    id: row.id,
    level: row.level as NamePoolLevel,
    scopeId: row.scopeId ?? null,
    name: row.name,
    kind: row.kind as NamePoolKind,
    gender: (row.gender as NamePoolGender | null) ?? null,
    region: row.region,
    eraStart: row.eraStart ?? null,
    eraEnd: row.eraEnd ?? null,
    source: row.source as NamePoolSource,
    isBakedIn: row.isBakedIn,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date
});

const rowToUsedName = (row: typeof schema.usedNames.$inferSelect): UsedName => ({
    id: row.id,
    storyId: row.storyId,
    name: row.name,
    nameType: row.nameType as UsedNameType,
    source: row.source as UsedNameSource,
    poolNameId: row.poolNameId ?? null,
    createdAt: row.createdAt as unknown as Date
});

const rowToFavorite = (row: typeof schema.nameFavorites.$inferSelect): NameFavorite => ({
    id: row.id,
    storyId: row.storyId,
    name: row.name,
    nameType: row.nameType as UsedNameType,
    poolId: row.poolId ?? null,
    createdAt: row.createdAt as unknown as Date
});

const rowToStoryDefaults = (row: typeof schema.storyNameDefaults.$inferSelect): StoryNameDefaults => ({
    storyId: row.storyId,
    era: row.era ?? null,
    region: row.region ?? null,
    gender: (row.gender as NamePoolGender | null) ?? null
});

// ── Story / series scope ──────────────────────────────────────────────────────────

// Mirrors lorebook.ts's GET /story/:storyId/hierarchical pattern: a story's own id plus (if it
// belongs to a series) every sibling story in that series. Used both to resolve which
// series-level pools are visible and to widen the used-names collision check across the series
// (locked decision #3: "story + auto-include series").
export const getStoryScopeIds = async (storyId: string): Promise<{ storyId: string; seriesId: string | null; siblingStoryIds: string[] }> => {
    const [story] = await db.select().from(schema.stories).where(eq(schema.stories.id, storyId));
    if (!story) throw new Error(`Story not found: ${storyId}`);

    if (!story.seriesId) return { storyId, seriesId: null, siblingStoryIds: [storyId] };

    const siblings = await db
        .select({ id: schema.stories.id })
        .from(schema.stories)
        .where(eq(schema.stories.seriesId, story.seriesId));

    return { storyId, seriesId: story.seriesId, siblingStoryIds: siblings.map(s => s.id) };
};

// ── Pools ──────────────────────────────────────────────────────────────────────────

export type PoolFilter = {
    kind?: NamePoolKind;
    gender?: NamePoolGender;
    region?: string;
    // Era bucket bounds — matched against pools whose [eraStart, eraEnd] range overlaps
    // (null bound on either side = open-ended, always matches).
    eraStart?: number;
    eraEnd?: number;
    poolId?: string;
};

// Global pools + (if storyId given) story-level pools + series-level pools for that story's
// series, same "global ∪ story ∪ series" shape as lorebook.ts's hierarchical entries query.
export const listPoolsForScope = async (
    storyId: string | undefined,
    filter: PoolFilter
): Promise<NamePoolSummary[]> => {
    const scopeConditions: (SQL | undefined)[] = [eq(schema.namePools.level, "global")];
    if (storyId) {
        const { seriesId } = await getStoryScopeIds(storyId);
        scopeConditions.push(and(eq(schema.namePools.level, "story"), eq(schema.namePools.scopeId, storyId)));
        if (seriesId) scopeConditions.push(and(eq(schema.namePools.level, "series"), eq(schema.namePools.scopeId, seriesId)));
    }

    const conditions: (SQL | undefined)[] = [or(...scopeConditions)];
    if (filter.poolId) conditions.push(eq(schema.namePools.id, filter.poolId));
    if (filter.kind) conditions.push(eq(schema.namePools.kind, filter.kind));
    if (filter.gender) conditions.push(eq(schema.namePools.gender, filter.gender));
    if (filter.region) conditions.push(eq(schema.namePools.region, filter.region));
    if (filter.eraEnd !== undefined) conditions.push(or(isNull(schema.namePools.eraStart), lte(schema.namePools.eraStart, filter.eraEnd)));
    if (filter.eraStart !== undefined) conditions.push(or(isNull(schema.namePools.eraEnd), gte(schema.namePools.eraEnd, filter.eraStart)));

    const pools = await db
        .select()
        .from(schema.namePools)
        .where(and(...conditions))
        .orderBy(schema.namePools.name);

    if (pools.length === 0) return [];

    const counts = await db
        .select({ poolId: schema.namePoolNames.poolId, count: sql<number>`count(*)` })
        .from(schema.namePoolNames)
        .where(inArray(schema.namePoolNames.poolId, pools.map(p => p.id)))
        .groupBy(schema.namePoolNames.poolId);
    const countByPoolId = new Map(counts.map(c => [c.poolId, c.count]));

    return pools.map(row => ({ ...rowToPool(row), nameCount: countByPoolId.get(row.id) ?? 0 }));
};

export const getPoolById = async (poolId: string): Promise<NamePool | null> => {
    const [row] = await db.select().from(schema.namePools).where(eq(schema.namePools.id, poolId));
    return row ? rowToPool(row) : null;
};

// ── Pool creation (NG5 import) ──────────────────────────────────────────────────────

export type InsertPoolParams = {
    id: string;
    level: NamePoolLevel;
    scopeId: string | null;
    name: string;
    kind: NamePoolKind;
    gender: NamePoolGender | null;
    region: string;
    eraStart: number | null;
    eraEnd: number | null;
    source: NamePoolSource;
    isBakedIn: boolean;
};

export const insertPool = async (params: InsertPoolParams): Promise<NamePool> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.namePools)
        .values({ ...params, createdAt: now, updatedAt: now })
        .returning();
    return rowToPool(row);
};

// Bulk insert — caller is responsible for deduping within a pool first (the unique
// (poolId, name) index would otherwise reject the whole batch on a single collision).
export const insertPoolNames = async (poolId: string, names: { name: string; tier: NamePoolTier }[]): Promise<number> => {
    if (names.length === 0) return 0;
    const now = new Date();
    await db.insert(schema.namePoolNames).values(names.map(n => ({ id: randomUUID(), poolId, name: n.name, tier: n.tier, createdAt: now })));
    return names.length;
};

// ── Pool names (candidates) ─────────────────────────────────────────────────────────

export type NameCandidate = { id: string; poolId: string; name: string; tier: NamePoolTier };

export const listCandidateNames = async (
    poolIds: string[],
    filter: { maxLength?: number; startsWith?: string }
): Promise<NameCandidate[]> => {
    if (poolIds.length === 0) return [];

    const conditions = [inArray(schema.namePoolNames.poolId, poolIds)];
    if (filter.startsWith) conditions.push(sql`lower(${schema.namePoolNames.name}) like ${filter.startsWith.toLowerCase() + "%"}`);

    const rows = await db
        .select({ id: schema.namePoolNames.id, poolId: schema.namePoolNames.poolId, name: schema.namePoolNames.name, tier: schema.namePoolNames.tier })
        .from(schema.namePoolNames)
        .where(and(...conditions));

    const candidates = rows.map(r => ({ id: r.id, poolId: r.poolId, name: r.name, tier: r.tier as NamePoolTier }));
    const { maxLength } = filter;
    return maxLength ? candidates.filter(c => c.name.length <= maxLength) : candidates;
};

// ── Collision checks ─────────────────────────────────────────────────────────────────

// Lowercased used-name set across every story in scope (self + series siblings), for a given
// nameType. Small per-story dataset — loaded in full and checked in-process rather than a
// per-candidate query.
export const getUsedNameSet = async (storyIds: string[], nameType: UsedNameType): Promise<Set<string>> => {
    const rows = await db
        .select({ name: schema.usedNames.name })
        .from(schema.usedNames)
        .where(and(inArray(schema.usedNames.storyId, storyIds), eq(schema.usedNames.nameType, nameType)));
    return new Set(rows.map(r => r.name.toLowerCase()));
};

// "Light lorebook character name check" (locked decision #9) — exact case-insensitive match
// against existing character entries visible to this story (global ∪ story ∪ series), no deep
// manuscript scan. Mirrors listPoolsForScope's own scope-resolution shape.
export const getCharacterNameSet = async (storyId: string): Promise<Set<string>> => {
    const { seriesId } = await getStoryScopeIds(storyId);
    const scopeConditions: (SQL | undefined)[] = [
        eq(schema.lorebookEntries.level, "global"),
        and(eq(schema.lorebookEntries.level, "story"), eq(schema.lorebookEntries.scopeId, storyId))
    ];
    if (seriesId) scopeConditions.push(and(eq(schema.lorebookEntries.level, "series"), eq(schema.lorebookEntries.scopeId, seriesId)));

    const rows = await db
        .select({ name: schema.lorebookEntries.name })
        .from(schema.lorebookEntries)
        .where(and(eq(schema.lorebookEntries.category, "character"), or(...scopeConditions)));
    return new Set(rows.map(r => r.name.toLowerCase()));
};

// ── Used names ledger ──────────────────────────────────────────────────────────────

export type InsertUsedNameParams = {
    storyId: string;
    name: string;
    nameType: UsedNameType;
    source: UsedNameSource;
    poolNameId?: string | null;
};

// Idempotent on (storyId, name, nameType) — the schema's unique index means a repeat "mark as
// used" call (e.g. a double-click) should return the existing row rather than throw.
export const insertUsedName = async (params: InsertUsedNameParams): Promise<UsedName> => {
    const [existing] = await db
        .select()
        .from(schema.usedNames)
        .where(and(eq(schema.usedNames.storyId, params.storyId), eq(schema.usedNames.name, params.name), eq(schema.usedNames.nameType, params.nameType)));
    if (existing) return rowToUsedName(existing);

    const [row] = await db
        .insert(schema.usedNames)
        .values({
            id: randomUUID(),
            storyId: params.storyId,
            name: params.name,
            nameType: params.nameType,
            source: params.source,
            poolNameId: params.poolNameId ?? null,
            createdAt: new Date()
        })
        .returning();
    return rowToUsedName(row);
};

export const listUsedNamesForStory = async (storyId: string): Promise<UsedName[]> => {
    const rows = await db.select().from(schema.usedNames).where(eq(schema.usedNames.storyId, storyId)).orderBy(schema.usedNames.createdAt);
    return rows.map(rowToUsedName);
};

// ── Favorites (NG7) ─────────────────────────────────────────────────────────────────

export type InsertFavoriteParams = {
    storyId: string;
    name: string;
    nameType: UsedNameType;
    poolId?: string | null;
};

// Idempotent on (storyId, name, nameType), same posture as insertUsedName above — a repeat
// "favorite" click returns the existing row rather than throwing on the unique index.
export const insertFavorite = async (params: InsertFavoriteParams): Promise<NameFavorite> => {
    const [existing] = await db
        .select()
        .from(schema.nameFavorites)
        .where(
            and(
                eq(schema.nameFavorites.storyId, params.storyId),
                eq(schema.nameFavorites.name, params.name),
                eq(schema.nameFavorites.nameType, params.nameType)
            )
        );
    if (existing) return rowToFavorite(existing);

    const [row] = await db
        .insert(schema.nameFavorites)
        .values({
            id: randomUUID(),
            storyId: params.storyId,
            name: params.name,
            nameType: params.nameType,
            poolId: params.poolId ?? null,
            createdAt: new Date()
        })
        .returning();
    return rowToFavorite(row);
};

// Scoped to storyId in the WHERE clause too, not just by id — prevents one story's favorite id
// from being deletable via a request scoped to a different story.
export const deleteFavorite = async (storyId: string, id: string): Promise<boolean> => {
    const result = await db
        .delete(schema.nameFavorites)
        .where(and(eq(schema.nameFavorites.id, id), eq(schema.nameFavorites.storyId, storyId)))
        .returning({ id: schema.nameFavorites.id });
    return result.length > 0;
};

export const listFavoritesForStory = async (storyId: string): Promise<NameFavorite[]> => {
    const rows = await db
        .select()
        .from(schema.nameFavorites)
        .where(eq(schema.nameFavorites.storyId, storyId))
        .orderBy(schema.nameFavorites.createdAt);
    return rows.map(rowToFavorite);
};

// ── Story name defaults (NG7) ────────────────────────────────────────────────────────

export type SaveStoryDefaultsParams = {
    storyId: string;
    era?: string | null;
    region?: string | null;
    gender?: NamePoolGender | null;
};

export const getStoryDefaults = async (storyId: string): Promise<StoryNameDefaults | null> => {
    const [row] = await db.select().from(schema.storyNameDefaults).where(eq(schema.storyNameDefaults.storyId, storyId));
    return row ? rowToStoryDefaults(row) : null;
};

// Upsert keyed on the unique storyId index — one row per story, only the fields the caller
// actually passes are touched (undefined = leave as-is, explicit null = clear back to "Any").
export const saveStoryDefaults = async (params: SaveStoryDefaultsParams): Promise<StoryNameDefaults> => {
    const [existing] = await db.select().from(schema.storyNameDefaults).where(eq(schema.storyNameDefaults.storyId, params.storyId));
    const now = new Date();

    if (!existing) {
        const [row] = await db
            .insert(schema.storyNameDefaults)
            .values({
                id: randomUUID(),
                storyId: params.storyId,
                era: params.era ?? null,
                region: params.region ?? null,
                gender: params.gender ?? null,
                favoritePoolIds: null,
                updatedAt: now
            })
            .returning();
        return rowToStoryDefaults(row);
    }

    const updates: Partial<typeof schema.storyNameDefaults.$inferInsert> = { updatedAt: now };
    if (params.era !== undefined) updates.era = params.era;
    if (params.region !== undefined) updates.region = params.region;
    if (params.gender !== undefined) updates.gender = params.gender;

    const [row] = await db
        .update(schema.storyNameDefaults)
        .set(updates)
        .where(eq(schema.storyNameDefaults.storyId, params.storyId))
        .returning();
    return rowToStoryDefaults(row);
};
