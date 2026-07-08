// Standalone smoke test for the sqlite-vec native extension.
//
// Run during the Docker build (and available to run manually) so a glibc/musl mismatch —
// or any other reason the extension fails to load on a given platform — fails loudly and
// immediately, rather than surfacing later as a runtime 500 the first time someone hits a
// RAG endpoint. See DECISIONS.md for why the base image matters here.
//
// Usage: node server/scripts/verify-sqlite-vec.mjs

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const fail = message => {
    console.error(`[verify-sqlite-vec] FAILED: ${message}`);
    process.exit(1);
};

try {
    const db = new Database(":memory:");
    sqliteVec.load(db);

    const { vec_version: version } = db.prepare("select vec_version() as vec_version").get();
    console.log(`[verify-sqlite-vec] extension loaded, version ${version}`);

    // Exercise the actual virtual table type the app relies on (see migration 0009),
    // not just that the extension loaded — a partial/broken build could load fine but
    // fail on vec0 specifically.
    db.exec("CREATE VIRTUAL TABLE vec_smoke_test USING vec0(embedding float[4])");
    db.prepare("INSERT INTO vec_smoke_test (rowid, embedding) VALUES (?, ?)").run(
        BigInt(1),
        new Float32Array([0.1, 0.2, 0.3, 0.4])
    );
    const row = db
        .prepare("SELECT rowid, distance FROM vec_smoke_test WHERE embedding MATCH ? AND k = 1 ORDER BY distance")
        .get(new Float32Array([0.1, 0.2, 0.3, 0.4]));

    if (!row || row.rowid !== 1 || typeof row.distance !== "number") fail(`unexpected KNN query result: ${JSON.stringify(row)}`);

    db.close();
    console.log("[verify-sqlite-vec] vec0 virtual table + KNN query OK");
} catch (error) {
    fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
