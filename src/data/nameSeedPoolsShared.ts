import type { NamePoolGender, NamePoolKind, NamePoolTier } from "../types/nameGenerator.js";

// Shared types/helper for the core baked-in name pool data (NG4,
// docs/Name_Generator_Design.md v0.4) — split across nameSeedPoolsUS.ts/nameSeedPoolsUK.ts to
// stay under the max-lines lint limit, combined back into one array by nameSeedPools.ts.
//
// `key` is a stable slug, not a DB id — seedNamePools.ts derives a deterministic namePools.id
// from it (`core:${key}`) so re-running the seed on every boot is idempotent without needing a
// separate natural-key column on the table.

export interface SeedName {
    name: string;
    tier: NamePoolTier;
}

export interface SeedNamePool {
    key: string;
    displayName: string;
    kind: NamePoolKind;
    gender: NamePoolGender | null;
    region: string;
    eraStart: number | null;
    eraEnd: number | null; // null = open/present
    names: SeedName[];
}

export const tiered = (common: string[], uncommon: string[], rare: string[]): SeedName[] => [
    ...common.map(name => ({ name, tier: "common" as const })),
    ...uncommon.map(name => ({ name, tier: "uncommon" as const })),
    ...rare.map(name => ({ name, tier: "rare" as const }))
];
