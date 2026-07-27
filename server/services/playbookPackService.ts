import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { extractTextFromFile } from "./documentImportService.js";
import type { PlaybookKey, PlaybookPack, PlaybookScope, PlaybookStyle } from "../../src/types/playbookPack.js";

// Character Guided Playbook Packs (Hybrid D), docs/Character_Guided_Playbook_Packs_Design.md.
// Packs are pure human-authored/imported curriculum documents, read/injected into chat context
// when armed — there is no AI-proposal/accept flow here (confirmed during planning: unlike the
// psych-module/place-sheet fence->card->merge pattern, nothing ever writes a pack from a chat
// reply). This service owns the resolve ladder, CRUD, copy-on-edit, import, and the boot seed.

const rowToPack = (row: typeof schema.playbookPacks.$inferSelect): PlaybookPack => ({
    id: row.id,
    playbookKey: row.playbookKey as PlaybookKey,
    style: row.style as PlaybookStyle,
    packScope: row.packScope as PlaybookScope,
    storyId: row.storyId ?? null,
    title: row.title,
    body: row.body,
    sourcePackId: row.sourcePackId ?? null,
    createdAt: row.createdAt as unknown as Date,
    updatedAt: row.updatedAt as unknown as Date
});

// ── Resolve ladder (design doc §3) ──────────────────────────────────────────────────
// story exact match -> global exact match -> shipped exact match -> null. Missing pack at every
// level is a soft success, not an error (design doc: "not an error").

export const resolvePlaybookPack = async (
    storyId: string | null,
    playbookKey: string,
    style: string
): Promise<PlaybookPack | null> => {
    const keyStyle = and(eq(schema.playbookPacks.playbookKey, playbookKey), eq(schema.playbookPacks.style, style));

    if (storyId) {
        const [storyRow] = await db
            .select()
            .from(schema.playbookPacks)
            .where(and(keyStyle, eq(schema.playbookPacks.packScope, "story"), eq(schema.playbookPacks.storyId, storyId)));
        if (storyRow) return rowToPack(storyRow);
    }

    const [globalRow] = await db.select().from(schema.playbookPacks).where(and(keyStyle, eq(schema.playbookPacks.packScope, "global")));
    if (globalRow) return rowToPack(globalRow);

    const [shippedRow] = await db.select().from(schema.playbookPacks).where(and(keyStyle, eq(schema.playbookPacks.packScope, "shipped")));
    if (shippedRow) return rowToPack(shippedRow);

    return null;
};

// ── List / CRUD ──────────────────────────────────────────────────────────────────────

// storyId: null lists shipped+global only (Settings' global-scope view). storyId: string also
// includes that story's own story-scoped rows (in-story Playbooks tool view).
export const listPlaybookPacks = async (storyId: string | null): Promise<PlaybookPack[]> => {
    const rows = await db
        .select()
        .from(schema.playbookPacks)
        .where(storyId ? undefined : isNull(schema.playbookPacks.storyId))
        .orderBy(desc(schema.playbookPacks.updatedAt));
    // storyId provided: return shipped+global (storyId IS NULL) plus this story's own rows.
    // Filtering in application code (not SQL OR) keeps the query above reusable for both cases
    // without a second and(...) branch — this table is small (a handful of packs), no scale concern.
    if (!storyId) return rows.map(rowToPack);
    const allRows = await db.select().from(schema.playbookPacks).orderBy(desc(schema.playbookPacks.updatedAt));
    return allRows.filter(row => row.storyId === null || row.storyId === storyId).map(rowToPack);
};

export type CreatePackParams = {
    playbookKey: string;
    style: string;
    packScope: "global" | "story"; // shipped is boot-seed only, never created via this path
    storyId: string | null;
    title: string;
    body: string;
    sourcePackId?: string | null;
};

export const createPlaybookPack = async (params: CreatePackParams): Promise<PlaybookPack> => {
    const now = new Date();
    const [row] = await db
        .insert(schema.playbookPacks)
        .values({
            id: randomUUID(),
            playbookKey: params.playbookKey,
            style: params.style,
            packScope: params.packScope,
            storyId: params.packScope === "story" ? params.storyId : null,
            title: params.title,
            body: params.body,
            sourcePackId: params.sourcePackId ?? null,
            createdAt: now,
            updatedAt: now
        })
        .returning();
    return rowToPack(row);
};

export type UpdatePackFields = { title?: string; body?: string };

// Blocks editing shipped rows in place — client should call copyPackForEdit instead (design doc
// §11's copy-on-edit lean). Returns null if not found or shipped.
export const updatePlaybookPack = async (id: string, fields: UpdatePackFields): Promise<PlaybookPack | null> => {
    const [existing] = await db.select().from(schema.playbookPacks).where(eq(schema.playbookPacks.id, id));
    if (!existing || existing.packScope === "shipped") return null;
    if (Object.keys(fields).length === 0) return rowToPack(existing);

    const [row] = await db
        .update(schema.playbookPacks)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(schema.playbookPacks.id, id))
        .returning();
    return rowToPack(row);
};

// Blocks deleting shipped rows (they're the permanent floor of the ladder). Deleting a
// global/story override is how "reset to shipped/global" works — the ladder just falls through.
export const deletePlaybookPack = async (id: string): Promise<boolean> => {
    const [existing] = await db.select().from(schema.playbookPacks).where(eq(schema.playbookPacks.id, id));
    if (!existing || existing.packScope === "shipped") return false;
    await db.delete(schema.playbookPacks).where(eq(schema.playbookPacks.id, id));
    return true;
};

// Copy-on-edit: "editing" a shipped/global pack creates a new row at the requested scope,
// pointing back at the source via sourcePackId. The source row is never touched.
export const copyPackForEdit = async (
    sourcePackId: string,
    targetScope: "global" | "story",
    targetStoryId: string | null
): Promise<PlaybookPack | null> => {
    const [source] = await db.select().from(schema.playbookPacks).where(eq(schema.playbookPacks.id, sourcePackId));
    if (!source) return null;
    return createPlaybookPack({
        playbookKey: source.playbookKey,
        style: source.style,
        packScope: targetScope,
        storyId: targetScope === "story" ? targetStoryId : null,
        title: source.title,
        body: source.body,
        sourcePackId: source.id
    });
};

// ── Import (.md/.txt, optional frontmatter) ─────────────────────────────────────────

// Minimal hand-rolled frontmatter: a leading `---` block of `key: value` lines, no YAML library
// needed for three flat string fields (design doc §4's "Frontmatter (optional)").
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type ParsedPackFile = {
    body: string;
    playbookKey: string | null;
    style: string | null;
    packScope: PlaybookScope | null;
    title: string | null;
};

export const parsePackFrontmatter = (text: string): ParsedPackFile => {
    const match = text.match(FRONTMATTER_RE);
    if (!match) return { body: text, playbookKey: null, style: null, packScope: null, title: null };

    const fields: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
        const sep = line.indexOf(":");
        if (sep === -1) continue;
        fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }

    return {
        body: text.slice(match[0].length),
        playbookKey: fields.playbookKey ?? null,
        style: fields.style ?? null,
        packScope: (fields.packScope as PlaybookScope | undefined) ?? null,
        title: fields.title ?? null
    };
};

// Only .md/.txt are supported (no LLM call — plain-text branch of extractTextFromFile, per the
// design doc's deterministic-first precedent from outlineImportService.ts's markdown handling).
export const readPackFileText = async (buffer: Buffer, filename: string): Promise<string> => {
    const ext = filename.toLowerCase().split(".").pop();
    if (ext !== "md" && ext !== "txt") throw new Error("Only .md and .txt files are supported for playbook pack import");
    return extractTextFromFile(buffer, filename);
};

// ── Boot-time seed (PP1) ─────────────────────────────────────────────────────────────

const SHIPPED_PLACEHOLDER_BODY =
    "_This pack is a shell — interview question content hasn't been authored yet. " +
    "Edit this pack (it will copy to a global override) or import your own `.md`/`.txt` file to replace it._";

const SHIPPED_PACKS: { playbookKey: string; style: string; title: string }[] = [
    { playbookKey: "character_codex", style: "light", title: "Character — Light Coverage (shipped)" },
    { playbookKey: "character_codex", style: "standard", title: "Character — Standard Coverage (shipped)" },
    { playbookKey: "character_codex", style: "grill", title: "Character — Grill-me Coverage (shipped)" },
    { playbookKey: "character_psych", style: "any", title: "Character — Psych Module Interview Cues (shipped)" }
];

// Idempotent, insert-only — same idiom as seedCoreNamePools()/seedSystemPrompts(). Only inserts
// a shipped row that's genuinely missing; never overwrites a shipped row a user has since edited
// via copy-on-edit (copy-on-edit never touches the shipped row itself, so this check is simply
// "does a shipped row for this key+style exist yet").
export const seedShippedPlaybookPacks = async (): Promise<void> => {
    const existing = await db.select().from(schema.playbookPacks).where(eq(schema.playbookPacks.packScope, "shipped"));
    const existingKeys = new Set(existing.map(row => `${row.playbookKey}:${row.style}`));

    const missing = SHIPPED_PACKS.filter(pack => !existingKeys.has(`${pack.playbookKey}:${pack.style}`));
    if (missing.length === 0) {
        console.log(`Shipped playbook packs already exist (${existing.length} found), nothing new to seed`);
        return;
    }

    const now = new Date();
    await db.insert(schema.playbookPacks).values(
        missing.map(pack => ({
            id: randomUUID(),
            playbookKey: pack.playbookKey,
            style: pack.style,
            packScope: "shipped" as const,
            storyId: null,
            title: pack.title,
            body: SHIPPED_PLACEHOLDER_BODY,
            sourcePackId: null,
            createdAt: now,
            updatedAt: now
        }))
    );
    console.log(`Seeded ${missing.length} shipped playbook pack shell(s)`);
};
