// Name Generator domain types — NG0/NG1 (docs/Name_Generator_Design.md v0.4).

export type NamePoolKind = "first_name" | "surname";
export type NamePoolGender = "male" | "female" | "unisex";
export type NamePoolSource = "core" | "import" | "generated";
export type NamePoolLevel = "global" | "series" | "story";
export type NamePoolTier = "common" | "uncommon" | "rare";

export const NAME_POOL_KINDS: NamePoolKind[] = ["first_name", "surname"];
export const NAME_POOL_GENDERS: NamePoolGender[] = ["male", "female", "unisex"];
export const NAME_POOL_TIERS: NamePoolTier[] = ["common", "uncommon", "rare"];

export interface NamePool {
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
    createdAt: Date;
    updatedAt: Date;
}

// Pool summary returned by the list endpoint — includes a count so the (future) panel can show
// pool size without a second round trip.
export interface NamePoolSummary extends NamePool {
    nameCount: number;
}

// Used-names ledger types — "story ∪ series" collision scope (locked decision #3).
export type UsedNameType = "first" | "surname" | "full";
export type UsedNameSource = "generated" | "manual" | "codex";

export const USED_NAME_TYPES: UsedNameType[] = ["first", "surname", "full"];
export const USED_NAME_SOURCES: UsedNameSource[] = ["generated", "manual", "codex"];

export interface UsedName {
    id: string;
    storyId: string;
    name: string;
    nameType: UsedNameType;
    source: UsedNameSource;
    poolNameId: string | null;
    createdAt: Date;
}

// Generate request/response — the panel-facing contract (NG2 consumes this; NG3's prompt syntax
// and NG6's chat fence both resolve down to the same generateNames() call server-side).
export interface GenerateNamesRequest {
    storyId: string;
    kind: NamePoolKind;
    gender?: NamePoolGender;
    region?: string;
    // "YYYY-YYYY" era bucket key, e.g. "1980-1999". Matched against pools whose [eraStart,
    // eraEnd] range overlaps.
    era?: string;
    // Explicit pool override — bypasses gender/region/era filters and generates from exactly
    // this pool (must match `kind`).
    poolId?: string;
    count?: number; // default 5, capped at 20
    maxLength?: number; // light filter (locked decision #5)
    startsWith?: string; // light filter (locked decision #5), case-insensitive prefix
}

export interface GeneratedName {
    name: string;
    poolId: string;
    poolName: string;
    tier: NamePoolTier;
}

export interface GenerateNamesResponse {
    names: GeneratedName[];
    matchedPoolIds: string[];
    excludedCount: number; // candidates filtered out as used-name/lorebook-character collisions
}

export interface MarkNameUsedRequest {
    storyId: string;
    name: string;
    nameType: UsedNameType;
    source: UsedNameSource;
    poolNameId?: string;
}

// Import (NG5) — level is deliberately just "global"|"story", not the three-way NamePoolLevel
// pools themselves carry; series-scoped import isn't offered (locked decision #7 only calls out
// "global and story-scoped pools").
export type ImportLevel = "global" | "story";

export interface ImportPoolsResponse {
    pools: NamePool[];
    namesImported: number;
    duplicatesSkipped: number;
}

export interface CsvImportMeta {
    poolName: string;
    kind: NamePoolKind;
    gender?: NamePoolGender;
    region: string;
    eraStart?: number;
    eraEnd?: number;
}

// Favorites — NG7 (locked decision #8's "favorites" half of "Search + filters + favorites/recent
// + per-story defaults"). Distinct from UsedName: a favorite is "I like this one, keep it
// visible" and never participates in collision avoidance.
export interface NameFavorite {
    id: string;
    storyId: string;
    name: string;
    nameType: UsedNameType;
    poolId: string | null;
    createdAt: Date;
}

export interface AddFavoriteRequest {
    storyId: string;
    name: string;
    nameType: UsedNameType;
    poolId?: string;
}

// Per-story sticky filter defaults — NG7 wires era/region/gender (favoritePoolIds stays unused,
// see schema.ts's storyNameDefaults comment). All optional/nullable: a story with no saved
// defaults yet, or a filter deliberately left "Any", both come back as null/undefined.
export interface StoryNameDefaults {
    storyId: string;
    era: string | null;
    region: string | null;
    gender: NamePoolGender | null;
}

export interface SaveStoryNameDefaultsRequest {
    storyId: string;
    era?: string | null;
    region?: string | null;
    gender?: NamePoolGender | null;
}
