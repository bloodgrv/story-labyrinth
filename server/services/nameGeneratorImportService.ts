import { randomUUID } from "node:crypto";
import { insertPool, insertPoolNames } from "./nameGeneratorRepository.js";
import { NAME_POOL_GENDERS, NAME_POOL_KINDS, NAME_POOL_TIERS } from "../../src/types/nameGenerator.js";
import type { NamePool, NamePoolGender, NamePoolKind, NamePoolTier } from "../../src/types/nameGenerator.js";

// NG5 (docs/Name_Generator_Design.md v0.4) — JSON pack + CSV import. Imported pools always get
// source: "import", isBakedIn: false (distinct from NG4's core seed and any future NG7 pack-
// script output) and a fresh randomUUID id — unlike seedNamePools.ts's deterministic `core:` ids,
// re-importing the same file twice is expected to create a second pool, not silently no-op; the
// user can tell duplicates apart in the pools list and delete the one they don't want.

export type ImportScope = { level: "global" | "story"; storyId?: string };

export interface ImportNameInput {
    name: string;
    tier?: string;
}

export interface ImportPoolInput {
    name: string;
    kind: string;
    gender?: string | null;
    region: string;
    eraStart?: number | null;
    eraEnd?: number | null;
    names: ImportNameInput[];
}

export interface ImportResult {
    pool: NamePool;
    namesImported: number;
    duplicatesSkipped: number;
}

const normalizeTier = (tier: string | undefined): NamePoolTier =>
    tier && NAME_POOL_TIERS.includes(tier.trim().toLowerCase() as NamePoolTier) ? (tier.trim().toLowerCase() as NamePoolTier) : "common";

// Case-insensitive dedupe, keeping first occurrence — the (poolId, name) unique index would
// otherwise reject the whole insert batch on a single collision within the same file.
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

const validatePoolInput = (input: ImportPoolInput): void => {
    if (!input.name?.trim()) throw new Error("Pool name is required");
    if (!NAME_POOL_KINDS.includes(input.kind as NamePoolKind)) throw new Error(`kind must be one of: ${NAME_POOL_KINDS.join(", ")}`);
    if (input.gender && !NAME_POOL_GENDERS.includes(input.gender as NamePoolGender))
        throw new Error(`gender must be one of: ${NAME_POOL_GENDERS.join(", ")}`);
    if (!input.region?.trim()) throw new Error("region is required");
    if (!Array.isArray(input.names) || input.names.length === 0) throw new Error(`Pool "${input.name}" has no names`);
};

export const importPool = async (input: ImportPoolInput, scope: ImportScope): Promise<ImportResult> => {
    validatePoolInput(input);
    if (scope.level === "story" && !scope.storyId) throw new Error("storyId is required for story-scoped import");

    const deduped = dedupeNames(input.names);
    if (deduped.length === 0) throw new Error(`Pool "${input.name}" has no valid names`);

    const pool = await insertPool({
        id: randomUUID(),
        level: scope.level,
        scopeId: scope.level === "story" ? (scope.storyId as string) : null,
        name: input.name.trim(),
        kind: input.kind as NamePoolKind,
        gender: (input.gender as NamePoolGender | undefined) ?? null,
        region: input.region.trim(),
        eraStart: input.eraStart ?? null,
        eraEnd: input.eraEnd ?? null,
        source: "import",
        isBakedIn: false
    });

    const namesImported = await insertPoolNames(pool.id, deduped);
    return { pool, namesImported, duplicatesSkipped: input.names.length - namesImported };
};

// A JSON pack is either one pool object or an array of them — bundling several related pools
// (e.g. multiple era buckets for a new region) in one file is the whole point of a "pack".
export const importPoolsFromJson = async (jsonText: string, scope: ImportScope): Promise<ImportResult[]> => {
    const parsed: unknown = JSON.parse(jsonText);
    const pools = (Array.isArray(parsed) ? parsed : [parsed]) as ImportPoolInput[];
    if (pools.length === 0) throw new Error("No pools found in JSON file");

    const results: ImportResult[] = [];
    for (const pool of pools) results.push(await importPool(pool, scope));
    return results;
};

// Minimal CSV grammar (quoted fields with "" escaping, comma-separated) — not full RFC4180, but
// enough for a two-column name/tier list. Header row is required so column order is flexible.
const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes && ch === '"' && line[i + 1] === '"') {
            current += '"';
            i++;
        } else if (inQuotes && ch === '"') inQuotes = false;
        else if (inQuotes) current += ch;
        else if (ch === '"') inQuotes = true;
        else if (ch === ",") {
            cells.push(current);
            current = "";
        } else current += ch;
    }
    cells.push(current);
    return cells.map(c => c.trim());
};

export const parseCsvNames = (csvText: string): ImportNameInput[] => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) throw new Error("CSV file is empty");

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx = header.indexOf("name");
    if (nameIdx === -1) throw new Error('CSV must have a "name" column header');
    const tierIdx = header.indexOf("tier");

    return lines
        .slice(1)
        .map(line => {
            const cells = parseCsvLine(line);
            return { name: cells[nameIdx] ?? "", tier: tierIdx !== -1 ? cells[tierIdx] : undefined };
        })
        .filter(n => n.name.trim().length > 0);
};

export type CsvPoolMeta = {
    name: string;
    kind: string;
    gender?: string;
    region: string;
    eraStart?: number;
    eraEnd?: number;
};

export const importPoolFromCsv = async (csvText: string, meta: CsvPoolMeta, scope: ImportScope): Promise<ImportResult> =>
    importPool({ ...meta, names: parseCsvNames(csvText) }, scope);
