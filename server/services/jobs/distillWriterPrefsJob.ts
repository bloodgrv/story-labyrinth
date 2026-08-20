import { gt } from "drizzle-orm";
import type { AgentJob } from "../../../src/types/agentJob.js";
import { AGENT_MEMORY_CATEGORIES } from "../../../src/types/agentMemory.js";
import type { AgentMemoryEvidence } from "../../../src/types/agentMemory.js";
import type { ChatMessage } from "../../../src/types/story.js";
import { db, schema } from "../../db/client.js";
import { getLastCompletedAt } from "../agentJobsRepository.js";
import { buildClientForFeature } from "../aiClientFactory.js";
import { proposeMemory } from "../agentMemoriesService.js";
import { parseDistillCandidates } from "./distillCandidateParser.js";

// distill_writer_prefs — the cross-project sibling of distill_memory. Always global
// (storyId: null on both the agentJobs row and every memory it proposes) — the one job in this
// codebase allowed to run unattended on a cadence (jobRunner.ts, gated behind
// writerPrefsSettings.autoDistillEnabled, default off), mirroring the one other opt-in-periodic
// LLM job precedent (stories.unattendedScanEnabled -> rag_scan_story). Every other distill/suggest
// job stays manual-trigger-only; this one earns the exception because "learn how I work across
// every story" is the actual feature request, not a per-story concern.
//
// Bounded input (same "cap it, don't mine everything" discipline as graphSuggestEdgesJob.ts's
// 60-entry cap): only chats touched since the last successful run (or a 14-day fallback on first
// run), only the user's own messages (not the AI's replies), capped at MAX_MESSAGES total. A quiet
// stretch with no new messages costs zero LLM spend — see the early return below.

const FALLBACK_LOOKBACK_MS = 14 * 24 * 60 * 60_000;
const MAX_MESSAGES = 400;

const WRITER_PREFS_SYSTEM_PROMPT = `You distill durable, cross-project writing-craft and workflow
preferences from a fiction writer's own chat messages across all of their stories. You will be
given a chronological list of the user's own messages (not the AI's replies) from various chat
sessions.

Look for genuinely recurring patterns in how this person writes and works — NOT one-off facts
about any single story's plot or characters. Examples of what counts: a consistently expressed
stylistic preference ("keep description sparse," "avoid purple prose"), a recurring workflow habit
("always renames placeholder names before finalizing"), a consistently rejected type of AI
suggestion, a standing instruction repeated across multiple sessions.

Rules:
- category must always be exactly "writer_pref".
- Only propose a candidate if the pattern is genuinely recurring across the sample, not something
  said once. When in doubt, skip it — a missed preference costs nothing, a wrong one costs trust.
- No psychology, corruption/power scoring, or theme tracking — craft and workflow only.
- Never invent a preference beyond what's actually evidenced in the messages.
- memoryKey should be a short, stable, kebab-case slug summarizing the preference's identity
  (e.g. "pref:sparse-description"), so a future update to the same preference can supersede this one.
- If nothing is worth remembering, return an empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{ "memoryKey": string, "category": "writer_pref", "title": string, "body": string, "evidence": string | null }`;

export const runDistillWriterPrefsJob = async (job: AgentJob): Promise<{ proposedCount: number; messagesConsidered: number }> => {
    const lastCompletedAt = await getLastCompletedAt("distill_writer_prefs", null);
    const cutoff = lastCompletedAt ?? new Date(Date.now() - FALLBACK_LOOKBACK_MS);

    const touchedChats = await db
        .select({ messages: schema.aiChats.messages })
        .from(schema.aiChats)
        .where(gt(schema.aiChats.updatedAt, cutoff));

    const userMessages = touchedChats
        .flatMap(chat => chat.messages as ChatMessage[])
        .filter(message => message.role === "user" && new Date(message.timestamp) > cutoff)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, MAX_MESSAGES);

    if (userMessages.length === 0) return { proposedCount: 0, messagesConsidered: 0 };

    const connection = await buildClientForFeature("agent_memory_distill");
    if (!connection)
        throw new Error(
            "No AI provider configured for Agent Memory Distillation. Set a global default or an 'Agent Memory Distillation' feature endpoint in AI Settings."
        );
    const { client, model } = connection;

    const messagesBlock = userMessages
        .slice()
        .reverse()
        .map(m => `- ${m.content}`)
        .join("\n");

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: WRITER_PREFS_SYSTEM_PROMPT },
            { role: "user", content: `=== USER MESSAGES (chronological) ===\n${messagesBlock}` }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const candidates = parseDistillCandidates(raw);

    let proposedCount = 0;
    for (const candidate of candidates) {
        // Defense-in-depth — the prompt forces "writer_pref" but a model can still hallucinate.
        if (candidate.category !== "writer_pref" || !AGENT_MEMORY_CATEGORIES.includes("writer_pref")) continue;

        const evidence: AgentMemoryEvidence[] | null = candidate.evidence
            ? [{ source: "chat", label: "distill_writer_prefs", excerpt: candidate.evidence }]
            : null;

        await proposeMemory({
            storyId: null,
            memoryKey: candidate.memoryKey,
            category: "writer_pref",
            title: candidate.title,
            body: candidate.body,
            sourceJobId: job.id,
            sourceScanId: null,
            sourceEvidence: evidence
        });
        proposedCount++;
    }

    return { proposedCount, messagesConsidered: userMessages.length };
};
