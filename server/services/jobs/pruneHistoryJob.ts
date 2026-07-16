import { and, inArray, lt } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { db, schema } from "../../db/client.js";

// Deliberately narrow, per the design doc's own "define narrow rules" hedge (§3.4): only prunes
// agentJobs rows themselves, not ragScans/ragScanIssues (out of scope — those may still be
// relied on for scan history display). Prevents the new jobs table from growing unbounded.
const RETENTION_DAYS = 30;

export const runPruneHistoryJob = async (_job: AgentJob): Promise<{ deleted: number }> => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);

    const rows = await db
        .delete(schema.agentJobs)
        .where(and(inArray(schema.agentJobs.status, ["completed", "failed"]), lt(schema.agentJobs.completedAt, cutoff)))
        .returning({ id: schema.agentJobs.id });

    return { deleted: rows.length };
};
