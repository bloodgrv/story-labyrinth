// Shared JSON-array candidate parser for distill_memory and distill_writer_prefs — both jobs ask
// their model for the exact same { memoryKey, category, title, body, evidence } shape, so the
// parsing/validation logic lives here once instead of copy-pasted per job.

export type DistillCandidate = {
    memoryKey: string;
    category: string;
    title: string;
    body: string;
    evidence: string | null;
};

export const parseDistillCandidates = (raw: string): DistillCandidate[] => {
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
