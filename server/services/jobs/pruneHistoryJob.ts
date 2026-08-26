import { and, inArray, lt } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { db, schema } from "../../db/client.js";
import { deleteStaleLoginAttempts } from "../authRepository.js";
import { pruneOldTransfers } from "../deskTransfersService.js";
import { purgeExpiredTrash } from "../../lib/trash.js";

// Deliberately narrow, per the design doc's own "define narrow rules" hedge (§3.4): only prunes
// a small named set of rows, not e.g. ragScans/ragScanIssues (out of scope — those may still be
// relied on for scan history display). Prevents these tables from growing unbounded.
const RETENTION_DAYS = 30;

export const runPruneHistoryJob = async (
    _job: AgentJob
): Promise<{ deletedJobs: number; deletedTransfers: number; purgedTrash: number; deletedLoginAttempts: number }> => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);

    const rows = await db
        .delete(schema.agentJobs)
        .where(and(inArray(schema.agentJobs.status, ["completed", "failed"]), lt(schema.agentJobs.completedAt, cutoff)))
        .returning({ id: schema.agentJobs.id });

    // Transfer Log (docs/Transfer_Log_And_Settings_IA_Design.md) — its own 90-day hard-delete
    // rule (HARD_DELETE_AFTER_DAYS in deskTransfersService.ts), reusing this job's existing daily
    // cadence rather than a second scheduled job type for one more narrow prune rule.
    const deletedTransfers = await pruneOldTransfers();

    // Trash / Restore (14-day soft-delete, docs/CURRENT_BACKLOG.md) — same "piggyback on this
    // job's existing daily cadence" precedent as Transfer Log pruning above, rather than a new
    // AgentJobType/scheduling path (see server/lib/trash.ts's TRASH_RETENTION_DAYS).
    const { purged: purgedTrash } = await purgeExpiredTrash();

    // Remote Access RF1 (docs/Remote_Access_Funnel_Design.md) — durable login-attempt rows have
    // no other cleanup path (unlike sessions' own opportunistic on-login delete), same "piggyback
    // on this job's existing daily cadence" precedent as the two rules above.
    const deletedLoginAttempts = await deleteStaleLoginAttempts(cutoff);

    return { deletedJobs: rows.length, deletedTransfers, purgedTrash, deletedLoginAttempts };
};
