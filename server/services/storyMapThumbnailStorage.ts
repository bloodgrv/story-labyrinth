import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Mirrors lorebookImageStorage.ts's disk-storage pattern exactly, own directory since these are a
// different entity (Maps v2 sketch documents, not lorebook entries). Same persistent Docker volume
// mount (data/ directory) — see that file's own comment for the reasoning.
const UPLOADS_DIR = process.env.STORY_MAP_THUMBNAILS_DIR || path.join(process.cwd(), "data", "uploads", "story-maps");

const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

export const isSupportedThumbnailMimetype = (mimetype: string): boolean => mimetype in MIME_TO_EXT;

// Saves a new thumbnail under a freshly-generated filename. Deliberately doesn't touch any
// previous file — callers delete the old one separately (see deleteStoryMapThumbnail) so a failed
// write never destroys a map's existing thumbnail.
export const saveStoryMapThumbnail = async (buffer: Buffer, mimetype: string): Promise<string> => {
    const ext = MIME_TO_EXT[mimetype];
    if (!ext) throw new Error(`Unsupported thumbnail type: ${mimetype}`);
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);
    return filename;
};

// Best-effort delete — a file that's already gone (or never existed) isn't an error here.
export const deleteStoryMapThumbnail = async (filename: string): Promise<void> => {
    await fs.rm(path.join(UPLOADS_DIR, filename), { force: true });
};

export const getStoryMapThumbnailPath = (filename: string): string => path.join(UPLOADS_DIR, filename);
