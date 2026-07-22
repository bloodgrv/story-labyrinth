// Core baked-in name pools — NG4 (docs/Name_Generator_Design.md v0.4). Small starter set per the
// locked "hybrid: small baked-in core in repo; rest via import packs and/or generation script"
// decision — NOT the full 100/300/capped-rare target size, just enough to be usable out of the
// box. v1 cut line: US/UK only, three era buckets from the design's 8-bucket scheme
// (1980-1999, 2000-2019, 2020-present), M/F/unisex first names + a flat (era/gender-independent)
// surname pool per region. Split across nameSeedPoolsUS.ts/nameSeedPoolsUK.ts to stay under the
// max-lines lint limit — this file just combines them.
import { UK_NAME_POOLS } from "./nameSeedPoolsUK.js";
import { US_NAME_POOLS } from "./nameSeedPoolsUS.js";

export type { SeedName, SeedNamePool } from "./nameSeedPoolsShared.js";

export const CORE_NAME_POOLS = [...US_NAME_POOLS, ...UK_NAME_POOLS];
