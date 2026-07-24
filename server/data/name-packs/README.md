# Name Generator — vendored region packs

24 offline-built region packs (NP0, `docs/Name_Generator_Region_Packs_Design.md`), vendored here
so the server can list/install them without any network access — same posture as the local
embedding model, minus the network fetch (these are static JSON, no download step needed).

- `manifest.json` — catalog consumed by `GET /api/name-generator/packs`: `packId`, `file`,
  `region`, `displayName`, `poolCount`, `nameCount`, `quality` (`solid | cleaned | thin`), `notes`,
  `sourceCountries`, `version`.
- `<packId>-pack.json` — one pack per file, each an array of pool objects in the same shape
  `nameGeneratorImportService.ts`'s JSON import already accepts (`name`, `kind`, `gender?`,
  `region`, `eraStart?`, `eraEnd?`, `names: [{name, tier}]`).

Built from `E:\NameGeneratorPacks\build_packs_from_dataset.py` (outside the app runtime, per the
design doc's locked decision P7). See that directory's own `PACKS.md`/`README.md`/
`US_UK_STARTER_COMPARE.md` for the build/cleanup trail and quality notes this manifest summarizes.

Korean was evaluated and dropped (dataset too thin, top hits were English noise) — not vendored.
