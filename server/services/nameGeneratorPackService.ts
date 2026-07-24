import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deletePoolsByIds, insertPool, insertPoolNames, listPoolIdsByPrefix } from "./nameGeneratorRepository.js";
import type { ImportNameInput, ImportPoolInput } from "./nameGeneratorImportService.js";
import { NAME_POOL_TIERS } from "../../src/types/nameGenerator.js";
import type { NamePackManifestEntry, NamePoolGender, NamePoolKind, NamePoolLevel, NamePoolTier } from "../../src/types/nameGenerator.js";

// Region packs (NP0-NP5, docs/Name_Generator_Region_Packs_Design.md) — vendored catalog of
// offline-built region packs, read from disk at request time (small static JSON, no benefit to
// caching in memory across requests). Mirrors seedDemoStory.ts's __dirname + readFileSync
// pattern for shipping JSON alongside compiled server code.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.join(__dirname, "../data/name-packs");

const readManifest = (): NamePackManifestEntry[] => {
    const text = readFileSync(path.join(PACKS_DIR, "manifest.json"), "utf-8");
    return JSON.parse(text) as NamePackManifestEntry[];
};

const readPackFile = (manifestEntry: NamePackManifestEntry): ImportPoolInput[] => {
    const text = readFileSync(path.join(PACKS_DIR, manifestEntry.file), "utf-8");
    const parsed = JSON.parse(text) as ImportPoolInput[];
    if (!Array.isArray(parsed)) throw new Error(`Pack file ${manifestEntry.file} must contain an array of pools`);
    return parsed;
};

// Deterministic slug per pool within a pack — same convention as seedNamePools.ts's `core:{key}`
// ids. Every vendored pack pool is either a gendered first-name era bucket or the pack's surname
// pool (confirmed by inspecting all 24 build outputs), so this covers the real shape without
// needing a slug field in the pack JSON itself.
const poolSlug = (pool: ImportPoolInput): string => {
    if (pool.kind === "surname") return "surnames";
    const gender = pool.gender ?? "unknown";
    return pool.eraStart ? `${gender}-${pool.eraStart}` : gender;
};

export const packPoolId = (packId: string, pool: ImportPoolInput): string => `pack:${packId}:${poolSlug(pool)}`;
const packIdPrefix = (packId: string): string => `pack:${packId}:`;

const normalizeTier = (tier: string | undefined): NamePoolTier =>
    tier && NAME_POOL_TIERS.includes(tier.trim().toLowerCase() as NamePoolTier) ? (tier.trim().toLowerCase() as NamePoolTier) : "common";

const dedupeNames = (names: ImportNameInput[]): { name: string; tier: NamePoolTier }[] => {
    const seen = new Set<string>();
    const result: { name: string; tier: NamePoolTier }[] = [];
    for (const n of names) {
        const trimmed = n.name?.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ name: trimmed, tier: normalizeTier(n.tier) });
    }
    return result;
};

// Lists the manifest, optionally annotated with per-scope install status (global always checked;
// story also checked when storyId is given) — the Browse-packs UI needs both to show "Installed"
// badges without a second round trip.
export const listPacks = async (storyId?: string): Promise<NamePackManifestEntry[]> => {
    const manifest = readManifest();

    const isInstalled = async (packId: string, level: NamePoolLevel, scopeId: string | null): Promise<boolean> =>
        (await listPoolIdsByPrefix(packIdPrefix(packId), level, scopeId)).length > 0;

    return Promise.all(
        manifest.map(async entry => ({
            ...entry,
            installed: {
                global: await isInstalled(entry.packId, "global", null),
                story: storyId ? await isInstalled(entry.packId, "story", storyId) : false
            }
        }))
    );
};

const findManifestEntry = (manifest: NamePackManifestEntry[], packId: string): NamePackManifestEntry => {
    const entry = manifest.find(e => e.packId === packId);
    if (!entry) throw new Error(`Unknown pack: ${packId}`);
    return entry;
};

export type PackScope = { level: NamePoolLevel; scopeId: string | null };

export interface InstallPackOutcome {
    packId: string;
    pools: Awaited<ReturnType<typeof insertPool>>[];
    namesImported: number;
    duplicatesSkipped: number;
}

// Idempotent install: pool ids are deterministic (`pack:{packId}:{slug}`), so an install that
// finds an already-existing pool for this pack+scope is a no-op for that pool unless `replace` is
// set, in which case every pool under this pack's prefix is deleted first (cascade-deletes its
// names) and reinserted fresh — same "clear then reinsert" idiom the design doc's NP5 calls for.
export const installPack = async (packId: string, scope: PackScope, replace: boolean): Promise<InstallPackOutcome> => {
    const manifest = readManifest();
    const entry = findManifestEntry(manifest, packId);
    const poolInputs = readPackFile(entry);

    if (replace) {
        const existingIds = await listPoolIdsByPrefix(packIdPrefix(packId), scope.level, scope.scopeId);
        await deletePoolsByIds(existingIds);
    }

    // Same "check existing ids, skip what's already there" idempotency as seedNamePools.ts's
    // core seed — re-install with replace:false is a clean no-op per pool, not a duplicate stack.
    const existingIds = new Set(await listPoolIdsByPrefix(packIdPrefix(packId), scope.level, scope.scopeId));

    const pools: Awaited<ReturnType<typeof insertPool>>[] = [];
    let namesImported = 0;
    let duplicatesSkipped = 0;

    for (const poolInput of poolInputs) {
        const id = packPoolId(packId, poolInput);
        if (existingIds.has(id)) continue;

        const deduped = dedupeNames(poolInput.names);
        if (deduped.length === 0) continue;

        const pool = await insertPool({
            id,
            level: scope.level,
            scopeId: scope.scopeId,
            name: poolInput.name.trim(),
            kind: poolInput.kind as NamePoolKind,
            gender: (poolInput.gender as NamePoolGender | undefined) ?? null,
            region: poolInput.region.trim(),
            eraStart: poolInput.eraStart ?? null,
            eraEnd: poolInput.eraEnd ?? null,
            source: "pack",
            isBakedIn: false
        });

        const imported = await insertPoolNames(pool.id, deduped);
        pools.push(pool);
        namesImported += imported;
        duplicatesSkipped += poolInput.names.length - imported;
    }

    return { packId, pools, namesImported, duplicatesSkipped };
};

export const uninstallPack = async (packId: string, scope: PackScope): Promise<number> => {
    const existingIds = await listPoolIdsByPrefix(packIdPrefix(packId), scope.level, scope.scopeId);
    await deletePoolsByIds(existingIds);
    return existingIds.length;
};
