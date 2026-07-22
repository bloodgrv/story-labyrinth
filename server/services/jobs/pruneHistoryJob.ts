import { and, inArray, lt } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { db, schema } from "../../db/client.js";
import { pruneOldTransfers } from "../deskTransfersService.js";

// Deliberately narrow, per the design doc's own "define narrow rules" hedge (§3.4): only prunes
// a small named set of rows, not e.g. ragScans/ragScanIssues (out of scope — those may still be
// relied on for scan history display). Prevents these tables from growing unbounded.
const RETENTION_DAYS = 30;

export const runPruneHistoryJob = async (_job: AgentJob): Promise<{ deletedJobs: number; deletedTransfers: number }> => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);

    const rows = await db
        .delete(schema.agentJobs)
        .where(and(inArray(schema.agentJobs.status, ["completed", "failed"]), lt(schema.agentJobs.completedAt, cutoff)))
        .returning({ id: schema.agentJobs.id });

    // Transfer Log (docs/Transfer_Log_And_Settings_IA_Design.md) — its own 90-day hard-delete
    // rule (HARD_DELETE_AFTER_DAYS in deskTransfersService.ts), reusing this job's existing daily
    // cadence rather than a second scheduled job type for one more narrow prune rule.
    const deletedTransfers = await pruneOldTransfers();

    return { deletedJobs: rows.length, deletedTransfers };
};
