import fs from "node:fs/promises";
import path from "node:path";
import { attemptPromise } from "@jfdi/attempt";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { convertLexicalToMarkdown } from "../../src/utils/export/convertLexicalToMarkdown.js";

// Manuscript Failsafe Save — a plain, human-readable Markdown copy of a story's full manuscript
// written to local disk, independent of the SQLite DB (server/db/client.ts's DATABASE_PATH). Not
// a history/versioning feature (chapterSnapshots/chapterVersions already cover that, both still
// inside the DB) — this is a redundant, readable-without-the-app backup for a worst-case DB-loss
// scenario. One file per story, overwritten every save. Written on demand (POST /:id/manuscript-
// backup, server/routes/stories.ts) and best-effort on every server shutdown (server/index.ts's
// shutdown()).
//
// Same data/ persistent-volume convention as the DB itself and lorebookImageStorage.ts's
// UPLOADS_DIR.
const BACKUP_DIR = process.env.MANUSCRIPT_BACKUP_DIR || path.join(process.cwd(), "data", "manuscript-backups");

// Path jail (mirrors lorebookImageStorage.ts's VALID_FILENAME) — storyId is a DB-controlled
// crypto.randomUUID() primary key, but it still isn't a filename until it's validated as one.
const VALID_STORY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const compileManuscriptMarkdown = (
    story: { title: string; author: string; synopsis: string | null },
    chapters: { order: number; title: string; content: string }[]
): string => {
    const chapterParts = chapters.map(chapter => {
        const chapterMarkdown = convertLexicalToMarkdown(chapter.content);
        return `## Chapter ${chapter.order}: ${chapter.title}\n\n${chapterMarkdown}`;
    });
    const synopsisPart = story.synopsis ? `**Synopsis:** ${story.synopsis}\n\n` : "";
    const headerPart = `# ${story.title}\n\n**Author:** ${story.author}\n\n${synopsisPart}---\n\n`;
    return headerPart + chapterParts.join("\n\n---\n\n");
};

// Writes (or overwrites) the one backup file for a single story. Returns the written file path,
// or null if the story doesn't exist (or is trashed). Write-to-temp-then-rename so a process
// killed mid-write (the shutdown-hook case, in particular) can never leave a half-written,
// corrupted backup file at the real path — `rename` on the same filesystem is atomic.
export const writeManuscriptBackup = async (storyId: string): Promise<string | null> => {
    if (!VALID_STORY_ID.test(storyId)) return null;

    const [story] = await db.select().from(schema.stories).where(and(eq(schema.stories.id, storyId), isNull(schema.stories.deletedAt)));
    if (!story) return null;

    const chapters = await db
        .select({ order: schema.chapters.order, title: schema.chapters.title, content: schema.chapters.content })
        .from(schema.chapters)
        .where(and(eq(schema.chapters.storyId, storyId), isNull(schema.chapters.deletedAt)))
        .orderBy(schema.chapters.order);

    const markdown = compileManuscriptMarkdown(story, chapters);

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const finalPath = path.join(BACKUP_DIR, `${storyId}.md`);
    const tempPath = `${finalPath}.tmp`;
    await fs.writeFile(tempPath, markdown, "utf-8");
    await fs.rename(tempPath, finalPath);

    return finalPath;
};

// Best-effort pass over every non-trashed story — used by the shutdown hook. Never throws: a
// single story's failure is logged and skipped so it can't block the rest of the pass or delay
// actual process shutdown.
export const writeAllManuscriptBackups = async (): Promise<void> => {
    const stories = await db.select({ id: schema.stories.id }).from(schema.stories).where(isNull(schema.stories.deletedAt));
    for (const story of stories) {
        const [error] = await attemptPromise(() => writeManuscriptBackup(story.id));
        if (error) console.error(`Manuscript backup failed for story ${story.id}:`, error);
    }
};
