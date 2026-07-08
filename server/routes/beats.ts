import { attemptPromise } from "@jfdi/attempt";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { createCrudRouter } from "../lib/crud.js";
import { detectConcreteBeatsForChapter } from "../services/beatDetector.js";

export default createCrudRouter({
    table: schema.concreteBeats,
    name: "Concrete beat",
    parentKey: "chapterId",
    customRoutes: (router, { asyncHandler }) => {
        // Persists suggestions (source: "ai_suggested", status: "pending") rather than
        // returning ephemeral candidates — see beatDetector.ts for why. Always 200; expected
        // failure modes (no AI provider, chapter not found) are { success: false, message }.
        router.post(
            "/detect",
            asyncHandler(async (req, res) => {
                const { chapterId, storyId } = req.body as { chapterId?: string; storyId?: string };
                if (!chapterId || !storyId) {
                    res.status(400).json({ success: false, message: "chapterId and storyId are required" });
                    return;
                }

                const [error, result] = await attemptPromise(() => detectConcreteBeatsForChapter(chapterId, storyId));
                if (error) {
                    res.json({ success: false, message: error.message });
                    return;
                }
                res.json(result);
            })
        );

        // Bulk-dismiss every still-pending suggestion for a chapter in one action ("Reject All").
        // Rows are kept with status "rejected", not deleted — same immutable-history convention
        // as codexPendingChanges.
        router.post(
            "/chapter/:chapterId/reject-all",
            asyncHandler(async (req, res) => {
                await db
                    .update(schema.concreteBeats)
                    .set({ status: "rejected" })
                    .where(
                        and(
                            eq(schema.concreteBeats.chapterId, req.params.chapterId),
                            eq(schema.concreteBeats.status, "pending")
                        )
                    );
                res.json({ success: true });
            })
        );
    }
});
