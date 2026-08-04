# Name Generator — Region Packs (post-NG0–NG7)

**Status:** Design locked 2026-07-23 · **NP0, NP1, NP2, NP4, NP5 shipped 2026-07-24. NP3 (bulk
install presets) shipped 2026-07-27.** All slices now done.  
**Parent:** `docs/Name_Generator_Design.md` v0.4 (NG0–NG7 **shipped**)  
**Backlog:** `docs/CURRENT_BACKLOG.md` P3 · slices **NP0–NP5**  
**Pack artifacts (local build):** `E:\NameGeneratorPacks\` (24 JSON packs + offline builder)

---

## Goal

Make the **24 region packs** (US/UK full + European / Slavic / MENA / Asia / Africa combos) first-class for Story Labyrinth writers — without bloating the **baked-in core** or breaking the hybrid model (locked decision #1: small core + packs/script).

---

## What already works (no code)

NG5 **JSON import** is live:

1. Open **Name Generator** tool  
2. **Import** → **JSON pack**  
3. Choose file e.g. `E:\NameGeneratorPacks\french-pack.json`  
4. Scope: **This story** or **Global**  
5. Import creates pools immediately; Region filter auto-picks up new `region` values  

Each pack file is an **array of pools** matching `nameGeneratorImportService.ts`:

```json
[
  {
    "name": "French Female (1980-present)",
    "kind": "first_name",
    "gender": "female",
    "region": "French",
    "eraStart": 1980,
    "names": [{ "name": "Marie", "tier": "common" }, ...]
  },
  { "name": "French Male (1980-present)", "kind": "first_name", "gender": "male", "region": "French", ... },
  { "name": "French Unisex (1980-present)", "kind": "first_name", "gender": "unisex", ... },
  { "name": "French Surnames", "kind": "surname", "region": "French", "names": [...] }
]
```

Tiers: **100 common / 300 uncommon / 100 rare** (some cleaned packs thinner on gendered first names, e.g. Turkish hint-split).

**Caveat today:** import is **not idempotent** — importing the same file twice creates a **second** set of pools (`source: "import"`, random UUID). Users must delete duplicates by hand. Pack-install product work (**NP1/NP5**) must fix that.

---

## Locked product decisions (2026-07-23)

| # | Topic | Decision |
|---|--------|----------|
| **P1** | vs baked-in core | **Keep hybrid.** US/UK tiny era seeds stay `source: "core"` / `isBakedIn`. Region packs are **optional installs**, not boot-seed of all ~24×4 pools. |
| **P2** | Where pack files live in repo | `data/name-packs/*.json` + `data/name-packs/manifest.json` (vendored copies of the offline build). Not in client bundle as giant TS arrays. |
| **P3** | Install UX | **In-app catalog** (Name Generator → Import → **Browse packs** tab) + keep file picker. Default install scope: **global**. |
| **P4** | Idempotency | Install by **pack id** (manifest). Re-install = no-op or replace-in-place; never silent duplicate stacks. |
| **P5** | US/UK full packs vs core | Ship full US/UK packs as **optional breadth** alongside core era buckets. Do **not** delete core. Panel can prefer core when era filter set; full pack when era=Any / region only. (Generate already unions matching pools.) |
| **P6** | Quality labels | Manifest marks `quality: solid \| cleaned \| thin` + short `notes` (Turkish F/M hint-split; Chinese diaspora nicknames; etc.). UI shows note before install. |
| **P7** | Offline builder | Stays **outside** the app runtime (`E:\NameGeneratorPacks\build_packs_from_dataset.py`). Repo may link to it in docs; no requirement to ship the Facebook dump. |
| **P8** | Korean | **Dropped** — do not vendor `korean-pack.json`. |

---

## Pack catalog (vendored set)

| packId | File | Region label | Notes |
|--------|------|--------------|--------|
| `us` | us-pack.json | US | Full population dump; complements era core |
| `uk` | uk-pack.json | UK | Same |
| `irish` | irish-pack.json | Irish | |
| `french` | french-pack.json | French | |
| `german` | german-pack.json | German | DE+AT+CH |
| `dutch` | dutch-pack.json | Dutch | NL+BE |
| `italian` | italian-pack.json | Italian | |
| `spanish` | spanish-pack.json | Spanish | ES+LatAm |
| `portuguese` | portuguese-pack.json | Portuguese | BR-forward |
| `scandinavian` | scandinavian-pack.json | Scandinavian | SE+NO+DK+FI |
| `greek` | greek-pack.json | Greek | surname noise filter applied |
| `polish` | polish-pack.json | Polish | |
| `slavic` | slavic-pack.json | Slavic | RU-forward + PL/CZ/…; Cyrillic→Latin |
| `canadian` | canadian-pack.json | Canadian | Multicultural |
| `turkish` | turkish-pack.json | Turkish | gender-hint split; thinner F/M + fat Unisex |
| `arabic` | arabic-pack.json | Arabic | MENA Arabic-majority blend |
| `mena` | mena-pack.json | MENA | Arabic + TR + IR |
| `israeli` | israeli-pack.json | Israeli | Geographic; mixed onomastics |
| `south-asian` | south-asian-pack.json | South Asian | IN+BD |
| `japanese` | japanese-pack.json | Japanese | English-name filter |
| `chinese` | chinese-pack.json | Chinese | CN+HK+TW; diaspora nicknames residual |
| `east-asian` | east-asian-pack.json | East Asian | JP+CN+HK+TW+SG; **no KR** |
| `west-african` | west-african-pack.json | West African | NG+… |
| `southern-african` | southern-african-pack.json | Southern African | ZA+… |

**24 packs.** All include **surnames** (+ F/M first; unisex when enough names).

---

## Implementation slices

| ID | Slice | Notes |
|----|--------|--------|
| **NP0** | ✅ Vendor packs + manifest into `data/name-packs/` | **Shipped 2026-07-24, at `server/data/name-packs/`** (not repo-root `data/`, see "Load-bearing choices" below) — all 24 JSON packs copied from `E:\NameGeneratorPacks\`; `manifest.json` (`packId`, `file`, `region`, `displayName`, `poolCount`, `nameCount`, `quality`, `notes`, `sourceCountries`, `version`), quality/notes transcribed from that directory's own `PACKS.md`. `server/data/name-packs/README.md` added (import-now + rebuild pointer). Multi-GB Facebook dump never touched. |
| **NP1** | ✅ Server: list + install pack APIs | `GET /api/name-generator/packs?storyId=` → manifest annotated with per-scope `installed: {global, story}`. `POST /api/name-generator/packs/:packId/install` body `{ level, storyId?, replace? }`; `POST /api/name-generator/packs/:packId/uninstall` body `{ level, storyId? }` (NP5, shipped together). New `server/services/nameGeneratorPackService.ts`. **Idempotent:** deterministic pool ids `pack:{packId}:{slug}` (`slug` = `${gender}-${eraStart}` or `surnames`, derived from each pool's own fields — every vendored pack pool is one of exactly those two shapes). `NamePoolSource` extended with a new `"pack"` value (plain text column, no migration needed). |
| **NP2** | ✅ UI: Browse packs in Import dialog | Third `TabsTrigger` ("Browse packs") in `ImportPoolDialog.tsx`; quality `Badge` (solid/cleaned/thin) + inline notes text, Install (scope select defaults to **global**, per locked decision #P3) / trash-icon Uninstall per row, "Installed" badge when already present at the selected scope. Reuses the existing `nameGeneratorKeys.all` invalidation so the Region filter picks up new pools immediately (confirmed live — see verification below). |
| **NP3** | ✅ Bulk install presets | **Shipped 2026-07-27.** 5 curated presets (European/MENA/Asian/African/Anglo-Americas) covering all 24 packIds with no overlap, client-side grouping only (`NAME_PACK_PRESETS` in `ImportPoolDialog.tsx`) — no manifest/schema change. A new `useInstallPresetMutation` calls the existing per-pack install endpoint via `Promise.allSettled` (one pack failing doesn't lose the rest) and shows one aggregate toast instead of N individual ones. Preset button shows pack count, flips to "— installed" (disabled) once every pack in that preset is installed at the current scope. |
| **NP4** | ✅ Docs + design sync | This status update + `Name_Generator_Design.md` § packs pointer + `CURRENT_BACKLOG.md`/`CLAUDE.md` kickoff lines. |
| **NP5** | ✅ Replace / uninstall pack | Shipped together with NP1 (same route file/service) — dedicated `POST .../uninstall` route, plus install's own `replace: true` flag (clears every `pack:{id}:*` pool at that scope first, then reinserts). |

**Order:** NP0 → NP1 → NP2 → NP4 (docs can ride with NP0) → NP5 → NP3 — followed as planned in full.

### Load-bearing choices (2026-07-24 implementation)

- **Vendored path is `server/data/name-packs/`, not repo-root `data/name-packs/`** as this doc's original NP0 row literally said — the only existing "ship a JSON file with the server, read it at runtime" precedent (`seedDemoStory.ts`) uses `server/data/`, and the Dockerfile's production stage already does a whole-directory `COPY --from=builder /app/server/data ./dist/server/server/data` that covers any new subdirectory there for free. A repo-root `data/` would have needed a new Dockerfile `COPY` line; this doesn't.
- **Idempotency mirrors `seedNamePools.ts`'s own pattern** (check existing deterministic ids, insert only what's missing) rather than catching a unique-constraint DB error — same idiom already established in this codebase, more resilient to whatever the underlying driver's error message happens to say.
- Live-verified end to end in the Browser pane against the real dev DB: `GET /packs` returned all 24 manifest entries; installing French (global scope) created exactly 4 pools (`pack:french:female-1980`, `pack:french:male-1980`, `pack:french:unisex-1980`, `pack:french:surnames`) with `source: "pack"` and 2000 names; the Region filter picked up "French" immediately after; a second install call with the same scope was a clean no-op (0 pools/names, confirming idempotency); uninstall removed exactly the 4 pools and the region disappeared from the filter again. All test installs cleaned up afterward.  

**Out of scope this track**

- Baking all packs into boot seed  
- SSA/ONS birth-year era matrix rebuild  
- Shipping the raw Facebook CSV dump  
- Korean pack  
- Auto-install all packs on first run  

---

## Data model note (idempotency)

Core pools use ids `core:{key}`.  
**Pack pools should use** `pack:{packId}:{slug}` e.g. `pack:french:female-1980`, `pack:french:surnames`.

- Install: insert missing pools + missing names (same pattern as `seedNamePools.ts`)  
- Or full replace under that prefix on `replace: true`  
- File-picker import (ad-hoc user JSON) **keeps** random UUID behavior (user content)

Optional later: `namePools.packId` column — only if deterministic ids prove insufficient for UI “which pack is this?”.

---

## In-app path (NP2 shipped)

```text
Name Generator → Import → Browse packs → pick a region → Install
(scope select defaults to Global; switch to "This story only" for a per-story library)
```

Re-installing is now a safe no-op (NP1's idempotent pool ids); use the trash icon to uninstall a
pack cleanly (NP5) before reinstalling with different content.

The old manual file-picker path (`Import → JSON pack → E:\NameGeneratorPacks\<region>-pack.json`)
still works unchanged, for any pack outside the vendored 24 (e.g. a future rebuild that isn't
re-vendored yet) — Browse packs only ever surfaces `server/data/name-packs/manifest.json`'s set.

---

## Quality reference

Offline compare (US/UK vs starter): `E:\NameGeneratorPacks\US_UK_STARTER_COMPARE.md`  
Builder + cleanup rules: `E:\NameGeneratorPacks\build_packs_from_dataset.py`, `PACKS.md`, `RUN_OFFLINE.md`

---

*Locked 2026-07-23. NP0/NP1/NP2/NP4/NP5 shipped 2026-07-24. NP3 (bulk presets) shipped 2026-07-27 — all slices done.*
