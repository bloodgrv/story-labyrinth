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

// Best-effort delete - a file that's already gone (or never existed) isn't an error here.
export const deleteLorebookImage = async (filename: string): Promise<void> => {
    await fs.rm(path.join(UPLOADS_DIR, filename), { force: true });
};

export const getLorebookImagePath = (filename: string): string => path.join(UPLOADS_DIR, filename);
