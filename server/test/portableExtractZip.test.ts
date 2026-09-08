import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractZipTo } from "../../scripts/portable-updater/lib/extractZip.mjs";

// The portable Windows self-updater used to extract its payload via PowerShell 5.1's
// [System.IO.Compression.ZipFile]::ExtractToDirectory, which is .NET Framework and so enforces
// MAX_PATH (260 chars) unless the machine sets LongPathsEnabled=1 — 0 being the Windows default.
// Six nested @radix-ui paths under @excalidraw in the payload cross that line on an ordinary
// install root, so updates died mid-extract with PathTooLongException, leaving a half-written
// versions/<x>/ folder. Reported by a user on 0.8.20 -> 0.8.22; it survived this long because the
// machine the builds are cut on has LongPathsEnabled=1 and therefore never reproduces it.
//
// The replacement (scripts/portable-updater/lib/extractZip.mjs) is hand-rolled because the
// updater must stay dependency-free, which makes these tests load-bearing in a way they wouldn't
// be for a library: a zip parsed slightly wrong corrupts an install.
//
// The fixtures below are written by a minimal zip writer in this file, so they verify the
// reader's *logic* (long paths, traversal refusal, both compression methods, CRC checking) but
// cannot catch a misunderstanding of the format shared by writer and reader. Compatibility with
// real Compress-Archive output is verified separately, against an actual payload — see
// DECISIONS.md's entry for this fix.

interface ZipEntryInput {
    name: string;
    data?: Buffer;
    method?: 0 | 8;
    /** Forces a wrong CRC-32 into the headers, to prove the reader actually checks it. */
    crcOverride?: number;
}

const DOS_2000_01_01 = 0x2821;

function buildZip(entries: ZipEntryInput[]): Buffer {
    const localChunks: Buffer[] = [];
    const centralChunks: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const isDirectory = entry.name.endsWith("/");
        const raw = isDirectory ? Buffer.alloc(0) : (entry.data ?? Buffer.alloc(0));
        const method = isDirectory ? 0 : (entry.method ?? 0);
        const stored = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const crc = entry.crcOverride ?? zlib.crc32(raw);
        const name = Buffer.from(entry.name, "utf8");

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(DOS_2000_01_01, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(stored.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localChunks.push(local, name, stored);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(0, 12);
        central.writeUInt16LE(DOS_2000_01_01, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(stored.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(isDirectory ? 0x10 : 0, 38);
        central.writeUInt32LE(offset, 42);
        centralChunks.push(central, name);

        offset += local.length + name.length + stored.length;
    }

    const centralDirectory = Buffer.concat(centralChunks);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirectory.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localChunks, centralDirectory, eocd]);
}

let workDir: string;

const zipFrom = (entries: ZipEntryInput[]): string => {
    const zipPath = path.join(workDir, `fixture-${Math.random().toString(36).slice(2)}.zip`);
    fs.writeFileSync(zipPath, buildZip(entries));
    return zipPath;
};

const destFor = (name: string) => path.join(workDir, name);

beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-extract-"));
});

afterEach(() => {
    fs.rmSync(path.toNamespacedPath(workDir), { recursive: true, force: true });
});

describe("extractZipTo", () => {
    it("round-trips stored and deflated entries and creates directory entries", () => {
        const plain = Buffer.from("hello portable updater");
        const compressible = Buffer.from("x".repeat(50_000));
        const zipPath = zipFrom([
            { name: "app/plain.txt", data: plain, method: 0 },
            { name: "app/compressible.txt", data: compressible, method: 8 },
            { name: "app/empty-dir/" }
        ]);
        const dest = destFor("out");

        const result = extractZipTo(zipPath, dest);

        expect(fs.readFileSync(path.join(dest, "app", "plain.txt")).equals(plain)).toBe(true);
        expect(fs.readFileSync(path.join(dest, "app", "compressible.txt")).equals(compressible)).toBe(true);
        expect(fs.statSync(path.join(dest, "app", "empty-dir")).isDirectory()).toBe(true);
        expect(result).toEqual({ files: 2, directories: 1 });
    });

    // The actual regression. On Windows this only passes because every fs call inside the
    // extractor goes through path.toNamespacedPath(); with plain paths and the default
    // LongPathsEnabled=0 it fails exactly the way the shipped .NET call did.
    it("writes entries whose full destination path exceeds MAX_PATH", () => {
        const segment = (letter: string) => letter.repeat(60);
        const deepName = `app/node_modules/${segment("a")}/${segment("b")}/${segment("c")}/${segment("d")}/index.module.js.map`;
        const payload = Buffer.from("deeply nested payload");
        const zipPath = zipFrom([{ name: deepName, data: payload, method: 8 }]);
        const dest = destFor("deep");

        const target = path.join(dest, ...deepName.split("/"));
        expect(target.length).toBeGreaterThan(260);

        extractZipTo(zipPath, dest);

        expect(fs.readFileSync(path.toNamespacedPath(target)).equals(payload)).toBe(true);
    });

    it("preserves each entry's modification time", () => {
        const zipPath = zipFrom([{ name: "app/dated.txt", data: Buffer.from("dated") }]);
        const dest = destFor("dated");

        extractZipTo(zipPath, dest);

        expect(fs.statSync(path.join(dest, "app", "dated.txt")).mtime.getFullYear()).toBe(2000);
    });

    it("reports progress with a monotonic count that ends at the entry total", () => {
        const zipPath = zipFrom([
            { name: "app/one.txt", data: Buffer.from("1") },
            { name: "app/two.txt", data: Buffer.from("2") }
        ]);
        const seen: Array<[number, number]> = [];

        extractZipTo(zipPath, destFor("progress"), { onProgress: (done, total) => seen.push([done, total]) });

        expect(seen.length).toBeGreaterThan(0);
        expect(seen.at(-1)).toEqual([2, 2]);
        expect(seen.every(([, total]) => total === 2)).toBe(true);
    });

    it.each([
        ["a parent-directory escape", "app/../../evil.txt"],
        ["a rooted absolute path", "/evil.txt"],
        ["a drive-qualified absolute path", "C:/evil.txt"]
    ])("refuses %s", (_label, name) => {
        const zipPath = zipFrom([{ name, data: Buffer.from("owned") }]);
        const dest = destFor("hostile");

        expect(() => extractZipTo(zipPath, dest)).toThrow(/refusing to extract/);
        expect(fs.existsSync(path.join(workDir, "evil.txt"))).toBe(false);
    });

    it("rejects an entry whose contents fail their CRC-32", () => {
        const zipPath = zipFrom([
            { name: "app/corrupt.txt", data: Buffer.from("good bytes"), crcOverride: 0xdeadbeef }
        ]);

        expect(() => extractZipTo(zipPath, destFor("corrupt"))).toThrow(/CRC-32 mismatch/);
    });

    it("rejects a file that is not a zip at all", () => {
        const notAZip = path.join(workDir, "not-a-zip.bin");
        fs.writeFileSync(notAZip, Buffer.alloc(1024, 7));

        expect(() => extractZipTo(notAZip, destFor("nope"))).toThrow(/not a zip file/);
    });
});
