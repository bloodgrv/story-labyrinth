// Dependency-free zip extractor for the portable self-updater's Windows path.
//
// WHY THIS EXISTS (2026-09-08, from a real user bug report): extraction used to shell out to
// PowerShell 5.1's `[System.IO.Compression.ZipFile]::ExtractToDirectory`. That is .NET
// *Framework*, which enforces the ancient MAX_PATH limit of 260 characters unless the machine
// has HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1 — and 0 is the
// Windows default. The update payload contains a handful of deeply nested paths that tip over
// it, e.g.
//
//   app/node_modules/@excalidraw/excalidraw/node_modules/@radix-ui/react-tabs/node_modules/
//     @radix-ui/react-roving-focus/node_modules/@radix-ui/react-collection/node_modules/
//     @radix-ui/react-slot/dist/index.module.js.map
//
// which is 210 characters before the destination root is even prepended. On an install at
// D:\Story-Labyrinth-portable-win-x64\ that lands at 266, and every update died mid-extract with
// System.IO.PathTooLongException — leaving a partial versions/<x>/ folder and a failed update.
// It went unnoticed for so long because the machine these builds are cut on has LongPathsEnabled
// = 1, so both Compress-Archive and any local extract silently succeed there.
//
// The fix is path.toNamespacedPath(): the \\?\ prefix is a *kernel-level* MAX_PATH bypass, so it
// works regardless of that registry setting. Every filesystem call below goes through it. That is
// the entire reason this module is hand-rolled rather than a one-line call to something else —
// .NET Framework can't be talked out of MAX_PATH, and the updater is deliberately dependency-free
// (Node built-ins only, no npm install of its own, ever) so a library is not an option either.
//
// Scope, deliberately: Windows only. macOS still uses /usr/bin/unzip, because its payload is
// built with `zip -ry` and carries symlinks and POSIX modes this extractor does not handle — and
// macOS has no MAX_PATH problem to solve in the first place.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

// A zip's trailing comment can be up to 64 KB, so the EOCD record can sit that far from the end.
const MAX_EOCD_SEARCH = 0xffff + 22;
// Sentinels meaning "the real value is in the zip64 extra field / zip64 EOCD record".
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

function readExact(fd, length, position) {
    const buffer = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
        const n = fs.readSync(fd, buffer, read, length - read, position + read);
        if (n === 0) throw new Error(`unexpected end of zip file at offset ${position + read}`);
        read += n;
    }
    return buffer;
}

// MS-DOS packed date/time -> Date. Preserves each file's mtime, which ExtractToDirectory also did;
// losing them would silently change behaviour for anything that compares timestamps.
function dosDateTimeToDate(time, date) {
    const year = ((date >> 9) & 0x7f) + 1980;
    const month = ((date >> 5) & 0x0f) - 1;
    const day = date & 0x1f;
    const hours = (time >> 11) & 0x1f;
    const minutes = (time >> 5) & 0x3f;
    const seconds = (time & 0x1f) * 2;
    const parsed = new Date(year, month, day, hours, minutes, seconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Zip64 stores oversized values in an extra field rather than the fixed header, and only includes
// the ones that actually overflowed — in this fixed order, each present only if its header slot
// held the all-ones sentinel. Getting that conditional ordering wrong is the classic zip64 bug.
function readZip64Extra(extra, needs) {
    const out = {};
    let offset = 0;
    while (offset + 4 <= extra.length) {
        const headerId = extra.readUInt16LE(offset);
        const size = extra.readUInt16LE(offset + 2);
        const body = extra.subarray(offset + 4, offset + 4 + size);
        if (headerId === 0x0001) {
            let at = 0;
            if (needs.size && at + 8 <= body.length) {
                out.size = Number(body.readBigUInt64LE(at));
                at += 8;
            }
            if (needs.compressedSize && at + 8 <= body.length) {
                out.compressedSize = Number(body.readBigUInt64LE(at));
                at += 8;
            }
            if (needs.localHeaderOffset && at + 8 <= body.length) {
                out.localHeaderOffset = Number(body.readBigUInt64LE(at));
                at += 8;
            }
            break;
        }
        offset += 4 + size;
    }
    return out;
}

function locateCentralDirectory(fd, fileSize) {
    const searchLength = Math.min(MAX_EOCD_SEARCH, fileSize);
    const tail = readExact(fd, searchLength, fileSize - searchLength);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD_SIG) {
            eocd = i;
            break;
        }
    }
    if (eocd === -1) throw new Error("not a zip file (no end-of-central-directory record found)");

    let entryCount = tail.readUInt16LE(eocd + 10);
    let centralSize = tail.readUInt32LE(eocd + 12);
    let centralOffset = tail.readUInt32LE(eocd + 16);

    // Zip64 kicks in past 65,535 entries or 4 GB. The current payload is ~56k entries, close
    // enough to that ceiling that a future one crossing it must not silently truncate to garbage.
    if (entryCount === U16_MAX || centralSize === U32_MAX || centralOffset === U32_MAX) {
        const locatorAt = eocd - 20;
        if (locatorAt < 0 || tail.readUInt32LE(locatorAt) !== ZIP64_LOCATOR_SIG) {
            throw new Error("zip claims zip64 sizes but has no zip64 end-of-central-directory locator");
        }
        const zip64At = Number(tail.readBigUInt64LE(locatorAt + 8));
        const zip64 = readExact(fd, 56, zip64At);
        if (zip64.readUInt32LE(0) !== ZIP64_EOCD_SIG) {
            throw new Error("zip64 end-of-central-directory record is missing or corrupt");
        }
        entryCount = Number(zip64.readBigUInt64LE(32));
        centralSize = Number(zip64.readBigUInt64LE(40));
        centralOffset = Number(zip64.readBigUInt64LE(48));
    }

    return { entryCount, centralSize, centralOffset };
}

function readCentralDirectory(fd, fileSize) {
    const { entryCount, centralSize, centralOffset } = locateCentralDirectory(fd, fileSize);
    // ~120 bytes per entry, so even a 65k-entry payload is single-digit MB — worth one read
    // rather than 65k seeks.
    const cd = readExact(fd, centralSize, centralOffset);

    const entries = [];
    let offset = 0;
    for (let i = 0; i < entryCount; i++) {
        if (offset + 46 > cd.length) throw new Error(`central directory truncated at entry ${i + 1} of ${entryCount}`);
        if (cd.readUInt32LE(offset) !== CENTRAL_SIG) {
            throw new Error(`corrupt central directory header at entry ${i + 1} of ${entryCount}`);
        }
        const flags = cd.readUInt16LE(offset + 8);
        const method = cd.readUInt16LE(offset + 10);
        const modTime = cd.readUInt16LE(offset + 12);
        const modDate = cd.readUInt16LE(offset + 14);
        const crc32 = cd.readUInt32LE(offset + 16);
        const nameLength = cd.readUInt16LE(offset + 28);
        const extraLength = cd.readUInt16LE(offset + 30);
        const commentLength = cd.readUInt16LE(offset + 32);
        const externalAttrs = cd.readUInt32LE(offset + 38);

        let compressedSize = cd.readUInt32LE(offset + 20);
        let size = cd.readUInt32LE(offset + 24);
        let localHeaderOffset = cd.readUInt32LE(offset + 42);

        const name = cd.toString("utf8", offset + 46, offset + 46 + nameLength);
        const extra = cd.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);

        const needs = {
            size: size === U32_MAX,
            compressedSize: compressedSize === U32_MAX,
            localHeaderOffset: localHeaderOffset === U32_MAX
        };
        if (needs.size || needs.compressedSize || needs.localHeaderOffset) {
            const zip64 = readZip64Extra(extra, needs);
            if (needs.size) size = zip64.size ?? size;
            if (needs.compressedSize) compressedSize = zip64.compressedSize ?? compressedSize;
            if (needs.localHeaderOffset) localHeaderOffset = zip64.localHeaderOffset ?? localHeaderOffset;
        }

        entries.push({
            name,
            flags,
            method,
            crc32,
            compressedSize,
            size,
            localHeaderOffset,
            externalAttrs,
            modTime,
            modDate
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

// Reject anything that would write outside the destination. ExtractToDirectory does its own
// version of this check; dropping it while replacing that call would be a quiet regression, and a
// malicious/corrupt payload is exactly the case where the updater must not scribble on the install.
function safeRelativeParts(entryName) {
    const normalized = entryName.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
        throw new Error(`refusing to extract absolute path from zip: ${entryName}`);
    }
    const parts = normalized.split("/").filter(part => part !== "" && part !== ".");
    if (parts.includes("..")) {
        throw new Error(`refusing to extract path escaping the destination: ${entryName}`);
    }
    return parts;
}

function inflateEntry(fd, entry) {
    const localHeader = readExact(fd, 30, entry.localHeaderOffset);
    if (localHeader.readUInt32LE(0) !== LOCAL_SIG) {
        throw new Error(`corrupt local header for ${entry.name}`);
    }
    // The local header's name/extra lengths are re-read rather than reused from the central
    // directory on purpose: the extra field legitimately differs between the two copies (zip64
    // and alignment padding live in one and not the other), so the central lengths would compute
    // the wrong data offset.
    const nameLength = localHeader.readUInt16LE(26);
    const extraLength = localHeader.readUInt16LE(28);
    const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const compressed = readExact(fd, entry.compressedSize, dataOffset);

    if (entry.method === 0) return compressed;
    if (entry.method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

/**
 * Extract `zipPath` into `destDir`. Synchronous, long-path safe, Windows-oriented.
 *
 * @param {string} zipPath
 * @param {string} destDir
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 * @returns {{ files: number, directories: number }}
 */
export function extractZipTo(zipPath, destDir, options = {}) {
    const { onProgress } = options;
    const fd = fs.openSync(path.toNamespacedPath(zipPath), "r");
    try {
        const fileSize = fs.fstatSync(fd).size;
        const entries = readCentralDirectory(fd, fileSize);

        const root = path.resolve(destDir);
        fs.mkdirSync(path.toNamespacedPath(root), { recursive: true });

        // 56k entries share a few thousand directories; without this every single file would pay
        // for a redundant recursive mkdir syscall.
        const ensuredDirs = new Set();
        const ensureDir = dir => {
            if (ensuredDirs.has(dir)) return;
            fs.mkdirSync(path.toNamespacedPath(dir), { recursive: true });
            ensuredDirs.add(dir);
        };

        let files = 0;
        let directories = 0;

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.flags & 0x1) throw new Error(`encrypted zip entries are not supported: ${entry.name}`);

            const parts = safeRelativeParts(entry.name);
            if (parts.length === 0) continue;
            const target = path.join(root, ...parts);

            const isDirectory =
                entry.name.endsWith("/") ||
                entry.name.endsWith("\\") ||
                (entry.externalAttrs & 0x10 && entry.size === 0);
            if (isDirectory) {
                ensureDir(target);
                directories++;
            } else {
                ensureDir(path.dirname(target));
                const contents = inflateEntry(fd, entry);

                if (contents.length !== entry.size) {
                    throw new Error(
                        `size mismatch for ${entry.name}: expected ${entry.size} bytes, got ${contents.length}`
                    );
                }
                // Free integrity check the old ExtractToDirectory call never gave us: a payload
                // that passed the outer SHA-256 but decompresses wrong is worth catching *here*,
                // while the update is still fully reversible, not at boot.
                if (typeof zlib.crc32 === "function" && zlib.crc32(contents) !== entry.crc32) {
                    throw new Error(`CRC-32 mismatch for ${entry.name} — the download is corrupt`);
                }

                const nsTarget = path.toNamespacedPath(target);
                fs.writeFileSync(nsTarget, contents);
                const mtime = dosDateTimeToDate(entry.modTime, entry.modDate);
                if (mtime) {
                    try {
                        fs.utimesSync(nsTarget, mtime, mtime);
                    } catch {
                        // A wrong mtime is cosmetic; never fail an update over one.
                    }
                }
                files++;
            }

            if (onProgress && (i % 500 === 0 || i === entries.length - 1)) onProgress(i + 1, entries.length);
        }

        return { files, directories };
    } finally {
        fs.closeSync(fd);
    }
}
