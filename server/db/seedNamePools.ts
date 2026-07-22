import { inArray } from "drizzle-orm";
import { CORE_NAME_POOLS } from "../../src/data/nameSeedPools.js";
import { db, schema } from "./client.js";

// Seeds the baked-in core name pools (NG4, docs/Name_Generator_Design.md v0.4) — mirrors
// seedSystemPrompts.ts's shape: idempotent, insert-only (never overwrites/deletes an existing
// row), safe to run on every boot. Pool ids are deterministic (`core:${key}`) rather than
// randomUUID() specifically so this file can check "does this pool already exist" without a
// separate natural-key column — only baked-in core pools get this treatment; user-created/
// imported pools still get a random id (see nameGeneratorRepository.ts).
export const seedCoreNamePools = async () => {
    const existingPools = await db.select({ id: schema.namePools.id }).from(schema.namePools);
    const existingPoolIds = new Set(existingPools.map(p => p.id));

    const missingPools = CORE_NAME_POOLS.filter(pool => !existingPoolIds.has(`core:${pool.key}`));
    if (missingPools.length > 0) {
        console.log(`Seeding ${missingPools.length} core name pool(s)...`);
        const now = new Date();
        await db.insert(schema.namePools).values(
            missingPools.map(pool => ({
                id: `core:${pool.key}`,
                level: "global" as const,
                scopeId: null,
                name: pool.displayName,
                kind: pool.kind,
                gender: pool.gender,
                region: pool.region,
                eraStart: pool.eraStart,
                eraEnd: pool.eraEnd,
                source: "core" as const,
                isBakedIn: true,
                createdAt: now,
                updatedAt: now
            }))
        );
    }

    // Names: check per-pool, not just per missing-pool — lets a later seed-data update add newly
    // introduced names to an already-seeded pool without duplicating existing ones.
    const allCorePoolIds = CORE_NAME_POOLS.map(pool => `core:${pool.key}`);
    const existingNames = await db
        .select({ poolId: schema.namePoolNames.poolId, name: schema.namePoolNames.name })
        .from(schema.namePoolNames)
        .where(inArray(schema.namePoolNames.poolId, allCorePoolIds));
    const existingNameKeys = new Set(existingNames.map(n => `${n.poolId}::${n.name}`));

    const now = new Date();
    const namesToInsert = CORE_NAME_POOLS.flatMap(pool => {
        const poolId = `core:${pool.key}`;
        return pool.names
            .filter(n => !existingNameKeys.has(`${poolId}::${n.name}`))
            .map(n => ({
                id: `core:${pool.key}:${n.name}`,
                poolId,
                name: n.name,
                tier: n.tier,
                createdAt: now
            }));
    });

    if (namesToInsert.length === 0) {
        console.log("Core name pools already seeded, nothing new to add");
        return;
    }

    console.log(`Seeding ${namesToInsert.length} name(s) into core name pools...`);
    await db.insert(schema.namePoolNames).values(namesToInsert);
};
