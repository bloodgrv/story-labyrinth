import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Lives under the same data/ directory as the SQLite DB (see server/db/client.ts's DATABASE_PATH
// for the identical resolution pattern) - already a persistent Docker volume mount
// (docker-compose.yml: ${DATA_PATH:-./data}:/app/data), so no new volume config is needed.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads", "lorebook");

const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
};

export const isSupportedImageMimetype = (mimetype: string): boolean => mimetype in MIME_TO_EXT;

// Path jail (B22): every filename this module ever writes is `${randomUUID()}.${ext}` (see
// saveLorebookImage below), so anything that doesn't match that shape did not come from this
// module's own write path — it arrived via a DB column that a generic CRUD PUT or a hand-edited
// story-import JSON can set to arbitrary text (e.g. "../../../etc/passwd"). Every read/delete of a
// stored filename must be checked against this allowlist before touching the filesystem.
const VALID_FILENAME = new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${Object.values(MIME_TO_EXT).join("|")})$`, "i");

export const isValidLorebookImageFilename = (filename: string): boolean => VALID_FILENAME.test(filename);

// Identifies an image's real format from its magic bytes — used for AI-generated images
// (grokImageService.ts), where the API doesn't guarantee a specific format the way a browser's
// File.type does for manual uploads. Returns null if none of the supported formats match.
export const sniffImageMimetype = (buffer: Buffer): string | null => {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return "image/png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")
        return "image/webp";
    if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a"))
        return "image/gif";
    return null;
};

// Saves a new image under a freshly-generated filename, returning it to store on the entry.
// Deliberately doesn't touch any previous file - callers delete the old one separately (see
// deleteLorebookImage) so a failed write never destroys an entry's existing image.
export const saveLorebookImage = async (buffer: Buffer, mimetype: string): Promise<string> => {
    const ext = MIME_TO_EXT[mimetype];
    if (!ext) throw new Error(`Unsupported image type: ${mimetype}`);
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);
    return filename;
};

// Best-effort delete - a file that's already gone (or never existed) isn't an error here. Silently
// no-ops on a filename that fails the path-jail check rather than throwing, matching the existing
// best-effort posture for a merely-missing file.
export const deleteLorebookImage = async (filename: string): Promise<void> => {
    if (!isValidLorebookImageFilename(filename)) return;
    await fs.rm(path.join(UPLOADS_DIR, filename), { force: true });
};

// Throws on a filename that fails the path-jail check — callers (image GET route) already handle
// "file not found" as a 404, so a thrown error here surfaces the same way without ever calling
// fs/sendFile on an unvalidated path.
export const getLorebookImagePath = (filename: string): string => {
    if (!isValidLorebookImageFilename(filename)) throw new Error(`Invalid stored image filename: ${filename}`);
    return path.join(UPLOADS_DIR, filename);
};
