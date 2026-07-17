import type { AgentJob } from "../../../src/types/agentJob.js";
import { AGENT_MEMORY_CATEGORIES } from "../../../src/types/agentMemory.js";
import type { AgentMemoryCategory, AgentMemoryEvidence } from "../../../src/types/agentMemory.js";
import { buildClientForFeature } from "../aiClientFactory.js";
import { proposeMemory } from "../agentMemoriesService.js";
import { getScanWithIssues } from "../ragScanner.js";

// distill_memory (Phase B) — reads a scan's findings and proposes factual, concrete project
// memory candidates. Always creates 'pending' rows only (via proposeMemory) — never touches
// status beyond that, satisfying the design doc's "distill_memory only creates pending rows"
// acceptance criterion structurally, not just by convention.
//
// Per the design doc's Phase A precedent for rag_scan_story ("background LLM spend must not
// surprise the user"), this job is deliberately NEVER auto-enqueued after a scan completes — see
// jobRunner.ts, which has no distill_memory entry in its schedule tick. The only way this job
// runs is a manual POST /api/agent/jobs { jobType: "distill_memory", storyId, entityId: scanId }.

const DISTILL_SYSTEM_PROMPT = `You distill factual, concrete project memory from a fiction-continuity
scan's findings. You will be given a list of detected issues (contradictions, state mismatches,
timeline problems) from a chapter/story scan.

For each genuinely reusable fact worth remembering long-term, propose a memory candidate. Rules:
- Factual/concrete only. No psychology, corruption/power scoring, or theme tracking.
- category must be exactly one of: established_fact, open_thread, event, voice_rule, project_note, writer_pref.
- Prefer linking to existing named entities when relevant (mention them by name in body/title).
- Skip low-confidence or purely stylistic issues — do not invent facts beyond what's in the input.
- memoryKey should be a short, stable, kebab-case slug summarizing the fact's identity
  (e.g. "fact:back-room-no-cameras"), so a future update to the same fact can supersede this one.
- If nothing is worth remembering, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{ "memoryKey": string, "category": string, "title": string, "body": string, "evidence": string | null }`;

type DistillCandidate = {
    memoryKey: string;
    category: string;
    title: string;
    body: string;
    evidence: string | null;
};

const parseCandidates = (raw: string): DistillCandidate[] => {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed: unknown[];
    try {
        parsed = JSON.parse(match[0]) as unknown[];
    } catch {
        return [];
    }

    return parsed
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .filter(
            c =>
                typeof c.memoryKey === "string" &&
                c.memoryKey.trim().length > 0 &&
                typeof c.category === "string" &&
                typeof c.title === "string" &&
                c.title.trim().length > 0 &&
                typeof c.body === "string" &&
                c.body.trim().length > 0
        )
        .map(c => ({
            memoryKey: (c.memoryKey as string).trim(),
            category: c.category as string,
            title: (c.title as string).trim(),
            body: (c.body as string).trim(),
            evidence: typeof c.evidence === "string" && c.evidence.trim() ? c.evidence.trim() : null
        }));
};

export const runDistillMemoryJob = async (job: AgentJob): Promise<{ scanId: string; proposedCount: number }> => {
    if (!job.storyId) throw new Error("distill_memory job requires storyId");
    if (!job.entityId) throw new Error("distill_memory job requires entityId (ragScans.id)");
    const storyId = job.storyId;
    const scanId = job.entityId;

    const scanWithIssues = await getScanWithIssues(scanId);
    if (!scanWithIssues) throw new Error(`Scan not found: ${scanId}`);
    const { issues } = scanWithIssues;
    if (issues.length === 0) return { scanId, proposedCount: 0 };

    const connection = await buildClientForFeature("agent_memory_distill");
    if (!connection)
        throw new Error(
            "No AI provider configured for Agent Memory Distillation. Set a global default or an 'Agent Memory Distillation' feature endpoint in AI Settings."
        );
    const { client, model } = connection;

    const issuesBlock = issues
        .map(i => `[${i.issueType}/${i.severity}] ${i.description}${i.suggestedFix ? ` (suggested fix: ${i.suggestedFix})` : ""}`)
        .join("\n");

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: DISTILL_SYSTEM_PROMPT },
            { role: "user", content: `=== SCAN ISSUES ===\n${issuesBlock}` }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const candidates = parseCandidates(raw);

    let proposedCount = 0;
    for (const candidate of candidates) {
        // Defense-in-depth against a model hallucinating an out-of-list category — proposeMemory
        // validates too, but skipping here avoids a partial-batch throw aborting the rest.
        if (!AGENT_MEMORY_CATEGORIES.includes(candidate.category as AgentMemoryCategory)) continue;

        const evidence: AgentMemoryEvidence[] | null = candidate.evidence
            ? [{ source: "scan", label: "distill_memory", excerpt: candidate.evidence }]
            : null;

        await proposeMemory({
            storyId,
            memoryKey: candidate.memoryKey,
            category: candidate.category as AgentMemoryCategory,
            title: candidate.title,
            body: candidate.body,
            sourceJobId: job.id,
            sourceScanId: scanId,
            sourceEvidence: evidence
        });
        proposedCount++;
    }

    return { scanId, proposedCount };
};
