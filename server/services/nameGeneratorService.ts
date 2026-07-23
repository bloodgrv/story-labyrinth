import {
    getCharacterNameSet,
    getPoolById,
    getStoryScopeIds,
    getUsedNameSet,
    insertUsedName,
    type InsertUsedNameParams,
    listCandidateNames,
    listPoolsForScope,
    listUsedNamesForStory,
    type NameCandidate
} from "./nameGeneratorRepository.js";
import type {
    GenerateNamesRequest,
    GenerateNamesResponse,
    GeneratedName,
    GeneratedNamePair,
    NamePoolKind,
    NamePoolTier,
    UsedName,
    UsedNameType
} from "../../src/types/nameGenerator.js";

// Sits over nameGeneratorRepository.ts the same way codexService.ts sits over
// codexRepository.ts: the repository is pure DB access, this layer owns validation, the
// used-name/lorebook collision filtering, and the weighted-tier random selection.

const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;

// Default tier weighting reflects the design's "top 100/300/capped rare" split — common names
// should dominate output, rare ones are occasional flavor. Pack-configurable later (NG5/NG7);
// hardcoded here for v1 since no pack has shipped its own weights yet.
const DEFAULT_TIER_WEIGHTS: Record<NamePoolTier, number> = { common: 0.7, uncommon: 0.25, rare: 0.05 };

const kindToUsedNameType = (kind: NamePoolKind): UsedNameType => (kind === "first_name" ? "first" : "surname");

const parseEraBucket = (era: string | undefined): { eraStart?: number; eraEnd?: number } => {
    if (!era) return {};
    const match = /^(\d{4})-(\d{4})$/.exec(era.trim());
    if (!match) throw new Error(`era must be formatted "YYYY-YYYY", got: ${era}`);
    return { eraStart: Number(match[1]), eraEnd: Number(match[2]) };
};

// Picks `count` candidates without replacement, weighted by tier. Each draw re-normalizes over
// whichever tiers still have remaining candidates, so a depleted tier doesn't waste draws or
// skew toward tiers that happen to be larger — it just stops contributing once empty.
const pickWeighted = (candidates: NameCandidate[], count: number): NameCandidate[] => {
    const byTier = new Map<NamePoolTier, NameCandidate[]>();
    for (const candidate of candidates) {
        const bucket = byTier.get(candidate.tier);
        if (bucket) bucket.push(candidate);
        else byTier.set(candidate.tier, [candidate]);
    }

    const picked: NameCandidate[] = [];
    for (let i = 0; i < count; i++) {
        const availableTiers = [...byTier.entries()]
            .filter(([, bucket]) => bucket.length > 0)
            .map(([tier, bucket]) => [tier, bucket, DEFAULT_TIER_WEIGHTS[tier]] as const);
        if (availableTiers.length === 0) break;

        const totalWeight = availableTiers.reduce((sum, [, , weight]) => sum + weight, 0);
        let roll = Math.random() * totalWeight;
        let chosenBucket = availableTiers[availableTiers.length - 1][1];
        for (const [, bucket, weight] of availableTiers) {
            roll -= weight;
            if (roll <= 0) {
                chosenBucket = bucket;
                break;
            }
        }

        const bucket = chosenBucket;
        const index = Math.floor(Math.random() * bucket.length);
        picked.push(bucket.splice(index, 1)[0]);
    }
    return picked;
};

export const generateNames = async (request: GenerateNamesRequest): Promise<GenerateNamesResponse> => {
    if (request.kind === "full_name") return generateFullNamePairs(request);
    return generateSingleKind(request as GenerateNamesRequest & { kind: NamePoolKind });
};

// "Full name" mode (independent-draw pairing, per the design's locked decision) — runs the
// existing single-kind generation once for first_name and once for surname, then zips the two
// result lists index-by-index into pairs. Each half keeps applying its own filters exactly as a
// solo generate would (gender only ever applies to the first-name half); a poolId override
// doesn't make sense here since a pair always spans two different pools.
const generateFullNamePairs = async (request: GenerateNamesRequest): Promise<GenerateNamesResponse> => {
    if (request.poolId) throw new Error("poolId is not supported with kind 'full_name' — a pair always draws from separate first-name and surname pools");

    const count = Math.min(Math.max(request.count ?? DEFAULT_COUNT, 1), MAX_COUNT);
    const [firstResult, lastResult] = await Promise.all([
        generateSingleKind({ ...request, kind: "first_name", count }),
        generateSingleKind({ ...request, kind: "surname", count, gender: undefined })
    ]);

    const pairCount = Math.min(firstResult.names.length, lastResult.names.length);
    const pairs: GeneratedNamePair[] = [];
    for (let i = 0; i < pairCount; i++) pairs.push({ firstName: firstResult.names[i], lastName: lastResult.names[i] });

    return {
        names: [],
        pairs,
        matchedPoolIds: [...new Set([...firstResult.matchedPoolIds, ...lastResult.matchedPoolIds])],
        excludedCount: firstResult.excludedCount + lastResult.excludedCount
    };
};

const generateSingleKind = async (request: GenerateNamesRequest & { kind: NamePoolKind }): Promise<GenerateNamesResponse> => {
    const count = Math.min(Math.max(request.count ?? DEFAULT_COUNT, 1), MAX_COUNT);
    const { eraStart, eraEnd } = parseEraBucket(request.era);

    let poolIds: string[];
    const poolNames = new Map<string, string>();

    if (request.poolId) {
        const pool = await getPoolById(request.poolId);
        if (!pool) throw new Error(`Pool not found: ${request.poolId}`);
        if (pool.kind !== request.kind) throw new Error(`Pool ${request.poolId} is kind '${pool.kind}', not '${request.kind}'`);
        poolIds = [pool.id];
        poolNames.set(pool.id, pool.name);
    } else {
        const pools = await listPoolsForScope(request.storyId, {
            kind: request.kind,
            gender: request.gender,
            region: request.region,
            eraStart,
            eraEnd
        });
        poolIds = pools.map(p => p.id);
        for (const pool of pools) poolNames.set(pool.id, pool.name);
    }

    if (poolIds.length === 0) return { names: [], matchedPoolIds: [], excludedCount: 0 };

    const candidates = await listCandidateNames(poolIds, { maxLength: request.maxLength, startsWith: request.startsWith });

    const { siblingStoryIds } = await getStoryScopeIds(request.storyId);
    const [usedSet, characterNameSet] = await Promise.all([
        getUsedNameSet(siblingStoryIds, kindToUsedNameType(request.kind)),
        getCharacterNameSet(request.storyId)
    ]);

    const filtered = candidates.filter(c => !usedSet.has(c.name.toLowerCase()) && !characterNameSet.has(c.name.toLowerCase()));

    const picked = pickWeighted(filtered, count);

    const names: GeneratedName[] = picked.map(c => ({
        name: c.name,
        poolId: c.poolId,
        poolName: poolNames.get(c.poolId) ?? "",
        tier: c.tier
    }));

    return { names, matchedPoolIds: poolIds, excludedCount: candidates.length - filtered.length };
};

export const markNameUsed = async (params: InsertUsedNameParams): Promise<UsedName> => insertUsedName(params);

export { listUsedNamesForStory };
