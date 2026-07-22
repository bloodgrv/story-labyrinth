import type { AgentJob } from "../../../src/types/agentJob.js";
import { STORY_GRAPH_EDGE_TYPES } from "../../../src/types/storyGraph.js";
import type { StoryGraphEdgeType } from "../../../src/types/storyGraph.js";
import { buildClientForFeature } from "../aiClientFactory.js";
import { proposeAiSuggestedEdge } from "../storyGraphService.js";
import { listActiveEdgesForStory, listPendingEdgesForStory, listVisibleEntriesForStory } from "../storyGraphRepository.js";

// graph_suggest_edges (P1.2 G1.5+, docs/CURRENT_BACKLOG.md) — reads a story's visible lorebook
// entries and proposes new storyGraphEdges rows for relationships the descriptions imply but
// nothing has recorded yet. Follows the exact "manual trigger only, pending-row output only"
// precedent as distill_memory/suggest_codex_updates: never auto-enqueued (no jobRunner.ts
// schedule-tick entry), and every candidate lands as status: "pending", source: "ai_suggested" —
// reviewed through the Pending tab's existing Approve/Reject actions, never applied directly.
//
// Unlike suggest_codex_updates (chapter-scoped, candidates filtered by name-mention in that
// chapter's text), this job is story-wide with no natural "what changed" filter — entry
// descriptions are mostly static. MAX_ENTRIES bounds prompt size/cost; entries are taken
// alphabetically for determinism (matches the graph tool's own default node ordering) rather
// than any relevance heuristic.

const MAX_ENTRIES = 60;
const MAX_DESCRIPTION_CHARS = 240;

type CandidateEntry = { id: string; name: string; category: string; description: string | null };

const SYSTEM_PROMPT = `You suggest concrete, factual relationships between entries in a fiction lorebook.
You are given a numbered list of entries (characters, locations, factions, items, etc.) each with a
short description, and a list of relationship types already recorded so you don't repeat them.

For each relationship you can support directly from the text of the descriptions (not invented,
not inferred from genre convention), propose one edge. Valid edgeType values, exactly as written:
${STORY_GRAPH_EDGE_TYPES.join(", ")}.

Only propose a relationship type from that list. Prefer specific types (e.g. "located_in", "member_of",
"works_at") over "other" whenever one fits. Do not propose a relationship already listed as existing.
Do not propose a relationship between an entry and itself. If nothing is clearly supported, return an
empty array.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{ "fromIndex": number, "toIndex": number, "edgeType": string, "label": string | null, "description": string | null }
"description" should briefly cite what in the text supports this edge.`;

type ParsedCandidate = {
    fromIndex: number;
    toIndex: number;
    edgeType: string;
    label: string | null;
    description: string | null;
};

const parseCandidates = (raw: string): ParsedCandidate[] => {
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
        .filter(c => typeof c.fromIndex === "number" && typeof c.toIndex === "number" && typeof c.edgeType === "string")
        .map(c => ({
            fromIndex: c.fromIndex as number,
            toIndex: c.toIndex as number,
            edgeType: (c.edgeType as string).trim(),
            label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : null,
            description: typeof c.description === "string" && c.description.trim() ? c.description.trim() : null
        }));
};

const isValidEdgeType = (value: string): value is StoryGraphEdgeType => STORY_GRAPH_EDGE_TYPES.includes(value as StoryGraphEdgeType);

export const runGraphSuggestEdgesJob = async (job: AgentJob): Promise<{ storyId: string; proposedCount: number }> => {
    if (!job.storyId) throw new Error("graph_suggest_edges job requires storyId");
    const storyId = job.storyId;

    const visibleEntries = await listVisibleEntriesForStory(storyId);
    const enabledEntries = visibleEntries.filter(e => !e.isDisabled);
    if (enabledEntries.length < 2) return { storyId, proposedCount: 0 };

    const candidates: CandidateEntry[] = [...enabledEntries]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_ENTRIES)
        .map(e => ({
            id: e.id,
            name: e.name,
            category: e.category,
            description: e.description ? e.description.slice(0, MAX_DESCRIPTION_CHARS) : null
        }));

    const [activeEdges, pendingEdges] = await Promise.all([listActiveEdgesForStory(storyId), listPendingEdgesForStory(storyId)]);
    const nameById = new Map(candidates.map(c => [c.id, c.name]));
    const existingKeys = new Set([...activeEdges, ...pendingEdges].map(e => `${e.fromId}|${e.toId}|${e.edgeType}`));
    const existingSummaryLines = [...activeEdges, ...pendingEdges]
        .map(e => `${nameById.get(e.fromId) ?? e.fromId} --${e.edgeType}--> ${nameById.get(e.toId) ?? e.toId}`)
        .slice(0, 200);

    const connection = await buildClientForFeature("graph_suggest_edges");
    if (!connection)
        throw new Error(
            "No AI provider configured for Relationship Graph edge suggestions. Set a global default or a 'Relationship Graph (Suggest Edges)' feature endpoint in AI Settings."
        );
    const { client, model } = connection;

    const entriesBlock = candidates.map((c, i) => `[${i}] ${c.name} (${c.category})${c.description ? `: ${c.description}` : ""}`).join("\n");
    const existingBlock = existingSummaryLines.length > 0 ? existingSummaryLines.join("\n") : "(none yet)";

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: `=== ENTRIES ===\n${entriesBlock}\n\n=== ALREADY RECORDED (do not repeat) ===\n${existingBlock}`
            }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    const parsedCandidates = parseCandidates(raw);

    let proposedCount = 0;
    for (const candidate of parsedCandidates) {
        const from = candidates[candidate.fromIndex];
        const to = candidates[candidate.toIndex];
        if (!from || !to || from.id === to.id) continue; // hallucinated index or self-reference — skip, don't throw
        if (!isValidEdgeType(candidate.edgeType)) continue;

        const key = `${from.id}|${to.id}|${candidate.edgeType}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key); // guard against the model proposing the same pair twice in one response

        const created = await proposeAiSuggestedEdge({
            storyId,
            fromId: from.id,
            toId: to.id,
            edgeType: candidate.edgeType,
            label: candidate.label,
            description: candidate.description
        });
        if (created) proposedCount++;
    }

    return { storyId, proposedCount };
};
