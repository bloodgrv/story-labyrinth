// Exports name pools to the same JSON pack format NG5's import endpoint accepts (server/routes/
// nameGenerator.ts's POST /import, one pool object or an array of them) — the "pack script" NG7
// calls for (docs/Name_Generator_Design.md v0.4, locked decision #1: "small baked-in core in
// repo; rest via import packs and/or generation script"). This is the export/backup/redistribute
// half — it does not invent new names (no LLM, no generation), only serializes what's already in
// the DB, so someone can back up their custom pools, share a region pack with another user, or
// hand-edit an exported file as a starting template for a new one.
//
// Usage:
//   node server/scripts/exportNamePack.mjs                        # global pools (default)
//   node server/scripts/exportNamePack.mjs --scope=story --storyId=<id>
//   node server/scripts/exportNamePack.mjs --scope=all             # every pool, any scope
//   node server/scripts/exportNamePack.mjs --out=my-pack.json

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const fail = message => {
    console.error(`[export-name-pack] FAILED: ${message}`);
    process.exit(1);
};

const args = Object.fromEntries(
    process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, "").split("=");
        return [key, value ?? "true"];
    })
);

const scope = args.scope ?? "global";
if (!["global", "story", "all"].includes(scope)) fail(`--scope must be "global", "story", or "all" (got: ${scope})`);
if (scope === "story" && !args.storyId) fail('--storyId is required when --scope=story');

const dbPath = process.env.DATABASE_PATH || "./data/storynexus.db";
if (!fs.existsSync(dbPath)) fail(`Database not found at ${dbPath} (set DATABASE_PATH if it's elsewhere)`);

const db = new Database(dbPath, { readonly: true });

const poolsQuery =
    scope === "global"
        ? db.prepare("SELECT * FROM namePools WHERE level = 'global' ORDER BY name")
        : scope === "story"
          ? db.prepare("SELECT * FROM namePools WHERE level = 'story' AND scopeId = ? ORDER BY name")
          : db.prepare("SELECT * FROM namePools ORDER BY name");

const pools = scope === "story" ? poolsQuery.all(args.storyId) : poolsQuery.all();
if (pools.length === 0) fail(`No pools found for scope=${scope}${scope === "story" ? ` storyId=${args.storyId}` : ""}`);

const namesStatement = db.prepare("SELECT name, tier FROM namePoolNames WHERE poolId = ? ORDER BY tier, name");

const pack = pools.map(pool => ({
    name: pool.name,
    kind: pool.kind,
    ...(pool.gender ? { gender: pool.gender } : {}),
    region: pool.region,
    ...(pool.eraStart !== null ? { eraStart: pool.eraStart } : {}),
    ...(pool.eraEnd !== null ? { eraEnd: pool.eraEnd } : {}),
    names: namesStatement.all(pool.id).map(n => ({ name: n.name, tier: n.tier }))
}));

db.close();

const outPath = path.resolve(process.cwd(), args.out ?? `name-pack-${scope}-${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify(pack, null, 2));

const totalNames = pack.reduce((sum, p) => sum + p.names.length, 0);
console.log(`[export-name-pack] wrote ${pack.length} pool(s), ${totalNames} name(s) -> ${outPath}`);
