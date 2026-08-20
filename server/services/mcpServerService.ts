import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { search } from "./ragIndexService.js";
import { getSpineChronologyExcerpt } from "./storyTimelineService.js";
import { convertLexicalToMarkdown } from "../../src/utils/export/convertLexicalToMarkdown.js";

// M4 (docs/MCP_Tool_Connections_Design.md §4.4) — the four read-only tools this app exposes to
// external MCP clients over /mcp. Two are direct reuse of existing shared service functions
// (getSpineChronologyExcerpt, search); get_chapter/list_notes/get_note have no existing
// service-layer function to call (chapters/notes both go through the fully generic
// createCrudRouter, server/lib/crud.ts, whose get-by-id/list-by-parent logic is inlined in the
// router rather than exported) — those two get small direct queries here instead. storyId (or a
// direct entity id) is always required explicitly on every tool; never an implied "current story."

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export const createMcpServer = (): McpServer => {
    const server = new McpServer({ name: "story-labyrinth", version: "1.0.0" });

    server.registerTool(
        "search_lorebook",
        {
            description: "Search this story's Lorebook (characters, locations, items, etc.) by keyword/semantic query.",
            inputSchema: { storyId: z.string().describe("The story's id"), query: z.string().describe("Search query") }
        },
        async ({ storyId, query }) => {
            const results = await search({ storyId, query, entityTypes: ["lorebook_entry"] });
            if (results.length === 0) return textResult("No matching lorebook entries found.");
            const text = results.map(r => `- (entryId: ${r.entityId}, score: ${r.score.toFixed(2)}) ${r.content}`).join("\n");
            return textResult(text);
        }
    );

    server.registerTool(
        "get_chapter",
        {
            description: "Fetch a chapter's title and full content (converted to Markdown).",
            inputSchema: { chapterId: z.string().describe("The chapter's id") }
        },
        async ({ chapterId }) => {
            const [chapter] = await db
                .select({ title: schema.chapters.title, content: schema.chapters.content })
                .from(schema.chapters)
                .where(and(eq(schema.chapters.id, chapterId), isNull(schema.chapters.deletedAt)));
            if (!chapter) return textResult(`No chapter found with id ${chapterId}.`);
            return textResult(`# ${chapter.title}\n\n${convertLexicalToMarkdown(chapter.content)}`);
        }
    );

    server.registerTool(
        "list_notes",
        {
            description: "List a story's notes (id, title, type only — use get_note for full content).",
            inputSchema: { storyId: z.string().describe("The story's id") }
        },
        async ({ storyId }) => {
            const rows = await db
                .select({ id: schema.notes.id, title: schema.notes.title, type: schema.notes.type })
                .from(schema.notes)
                .where(and(eq(schema.notes.storyId, storyId), isNull(schema.notes.deletedAt)));
            if (rows.length === 0) return textResult("No notes found for this story.");
            return textResult(rows.map(n => `- ${n.title} (${n.type}) [id: ${n.id}]`).join("\n"));
        }
    );

    server.registerTool(
        "get_note",
        {
            description: "Fetch a single note's full content.",
            inputSchema: { noteId: z.string().describe("The note's id") }
        },
        async ({ noteId }) => {
            const [note] = await db
                .select({ title: schema.notes.title, content: schema.notes.content, type: schema.notes.type })
                .from(schema.notes)
                .where(and(eq(schema.notes.id, noteId), isNull(schema.notes.deletedAt)));
            if (!note) return textResult(`No note found with id ${noteId}.`);
            return textResult(`# ${note.title} (${note.type})\n\n${note.content}`);
        }
    );

    server.registerTool(
        "get_story_timeline",
        {
            description: "Get the story's Spine timeline — ordered chronology of established story beats.",
            inputSchema: { storyId: z.string().describe("The story's id") }
        },
        async ({ storyId }) => {
            const pins = await getSpineChronologyExcerpt(storyId);
            if (pins.length === 0) return textResult("No timeline pins found for this story.");
            const text = pins.map(p => `- ${p.title} (${p.when})${p.blurb ? `: ${p.blurb}` : ""}`).join("\n");
            return textResult(text);
        }
    );

    return server;
};
