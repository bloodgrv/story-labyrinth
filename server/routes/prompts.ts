import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { parseJson } from "../lib/json.js";

// Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — plain hard-delete, no side
// effects to relocate; kept as its own exported function purely so the Trash registry has one
// consistent shape to call across every entity. Called by purgeExpiredTrash() (scheduled) and by
// the Trash panel's manual "Delete forever" action.
export const purgePrompt = async (promptId: string): Promise<void> => {
    await db.delete(schema.prompts).where(eq(schema.prompts.id, promptId));
};

type PromptRow = typeof schema.prompts.$inferSelect;

interface TransformedPrompt extends Omit<PromptRow, "messages" | "allowedModels"> {
    messages: unknown;
    allowedModels: unknown;
}

const transform = (p: PromptRow): TransformedPrompt => ({
    ...p,
    messages: parseJson(p.messages as string),
    allowedModels: parseJson(p.allowedModels as string)
});

export default createCrudRouter({
    table: schema.prompts,
    name: "Prompt",
    transforms: { afterRead: transform },
    softDelete: true,
    customRoutes: (router, { asyncHandler, table }) => {
        // Custom GET with query filters
        router.get(
            "/",
            asyncHandler(async (req, res) => {
                const { storyId, promptType, includeSystem } = req.query;

                const query = storyId
                    ? db
                          .select()
                          .from(table)
                          .where(and(or(eq(table.storyId, storyId as string), isNull(table.storyId)), isNull(table.deletedAt)))
                    : db.select().from(table).where(isNull(table.deletedAt));

                const allRows = await query;

                const filtered = allRows
                    .filter(p => !promptType || p.promptType === promptType)
                    .filter(p => includeSystem === "true" || !p.isSystem);

                res.json(filtered.map(transform));
            })
        );

        // Custom DELETE - prevent deleting system prompts; move non-system ones to Trash instead
        // of deleting them (real hard-delete relocated to purgePrompt above).
        router.delete(
            "/:id",
            asyncHandler(async (req, res) => {
                const [prompt] = await db.select().from(table).where(eq(table.id, req.params.id));
                if (prompt?.isSystem) {
                    res.status(403).json({ error: "Cannot delete system prompts" });
                    return;
                }
                await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, req.params.id));
                res.json({ success: true });
            })
        );
    }
});
