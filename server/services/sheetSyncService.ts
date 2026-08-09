import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import type { CodexCustomField, CodexState, CodexStateItem } from "../../src/types/codex.js";
import { buildClientForFeature } from "./aiClientFactory.js";
import { proposeChange } from "./codexService.js";

// Lore Sheet Sync loop (T5 FS3, docs/Lore_Sheet_And_Sync_Design.md §5/§6) — "Sync structured
// fields": hybrid deterministic `##` split + LLM row/list extraction, always proposed through the
// existing codexPendingChanges tray (same propose→Accept gate every other Codex proposal already
// uses, never a silent write). Scoped narrower than the design doc's full §3/§4 tables in two
// deliberate, documented ways:
//
// 1. Structured (non-description) sync targets only exist for `character` (Codex customFields/
//    appearance/wardrobe/wounds/items) and `location` (placeState-shaped customFields/items,
//    mirrored the same way `placeStateToCodexFields`/handleAcceptPlaceSheet already do for
//    chat-sourced place-sheet proposals) — the only two categories with a live structured-state
//    UI to review the result in. The other six categories (item/event/note/synopsis/starting
//    scenario/timeline) only ever get their narrative sections compiled into `description`; the
//    design doc's own §4 table names some further customFields-ish targets for item/event/
//    timeline, but nothing in this app has ever rendered arbitrary customFields for those
//    categories, so proposing into them would create data with no review surface — cut, not built.
// 2. Location's structured half only fires when the entry is already `codexEnabled` (L4's "Track
//    Place State" toggle) — matching the design doc's own "Place Codex mirror when tracking" note.
//    A non-tracking location still gets its description compiled every time; flipping the
//    existing toggle (already in the entry editor) is what unlocks the structured half, rather
//    than this service inventing a second, parallel non-Codex proposal mechanism.

interface SheetSection {
    heading: string;
    content: string;
}

// Deterministic `##` split — same regex parseSheetHeadings (client, sheetTemplates.ts) uses,
// duplicated here rather than imported since server code doesn't reach into src/features/*.
const splitSheetSections = (sheetBody: string): SheetSection[] => {
    const regex = /^##\s+(.+)$/gm;
    const matches: { heading: string; index: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sheetBody)) !== null) matches.push({ heading: match[1].trim(), index: match.index });

    return matches.map((h, i) => {
        const lineEnd = sheetBody.indexOf("\n", h.index);
        const contentStart = lineEnd === -1 ? sheetBody.length : lineEnd + 1;
        const contentEnd = i + 1 < matches.length ? matches[i + 1].index : sheetBody.length;
        return { heading: h.heading, content: sheetBody.slice(contentStart, contentEnd).trim() };
    });
};

type SectionRole =
    | { kind: "narrative" }
    | { kind: "labeledFields"; allowedLabels?: string[] } // -> CodexCustomField[] (character customFields, or location's fixed-label sections)
    | { kind: "labeledAppearance" } // -> codexState.appearance (character only)
    | { kind: "stringList"; target: "wardrobe" | "wounds" | "items" } // -> a flat codexState array
    | { kind: "singleValue"; label: string }; // whole section content becomes one customField

const CHARACTER_SECTIONS: Record<string, SectionRole> = {
    "core identity": { kind: "labeledFields" },
    "physical appearance": { kind: "labeledAppearance" },
    wardrobe: { kind: "stringList", target: "wardrobe" },
    "personality & temperament": { kind: "narrative" },
    "background & lifestyle": { kind: "narrative" },
    "character motivations": { kind: "narrative" },
    "wounds / marks": { kind: "stringList", target: "wounds" },
    "items / possessions": { kind: "stringList", target: "items" }
};

// Only consulted when the entry is codexEnabled (see file header, deliberate cut #2) — mirrors
// placeCodexMapping.ts's PLACE_STATE_FIELD_LABELS shape (customFields + items/landmarks) without
// importing it (that file lives in src/features/lorebook, client-only).
const LOCATION_SECTIONS: Record<string, SectionRole> = {
    overview: { kind: "narrative" },
    "scale & nature": { kind: "labeledFields", allowedLabels: ["Scale", "Biome / Climate"] },
    "holder & control": { kind: "labeledFields", allowedLabels: ["Holder", "Danger Level"] },
    landmarks: { kind: "stringList", target: "items" },
    "exits & links": { kind: "singleValue", label: "Exits Summary" },
    "layout notes": { kind: "singleValue", label: "Layout" },
    atmosphere: { kind: "narrative" }
};

// Every heading treats as narrative — a small helper for the six categories with no structured
// sync target (see file header, deliberate cut #1). Headings match sheetTemplates.ts's own
// per-category packs (client-side), duplicated here for the same reason splitSheetSections is.
const allNarrative = (headings: string[]): Record<string, SectionRole> =>
    Object.fromEntries(headings.map(heading => [heading.toLowerCase(), { kind: "narrative" as const }]));

const SECTION_CONFIGS: Record<string, Record<string, SectionRole>> = {
    character: CHARACTER_SECTIONS,
    location: LOCATION_SECTIONS,
    item: allNarrative(["Overview", "Appearance", "Properties", "History", "Ownership"]),
    event: allNarrative(["Summary", "When", "Where", "Who", "Outcome", "Aftermath"]),
    synopsis: allNarrative(["Logline", "Summary", "Themes", "Scope"]),
    "starting scenario": allNarrative(["Situation", "Stakes", "Opening Image", "Constraints"]),
    timeline: allNarrative(["Summary", "Era", "Sequence Notes"])
};

// Real live-model output caught this: a reply written as "**Label:** value" (markdown bold around
// the label, common model formatting) was NOT the bullet-marker case the old `^[-*]\s*` regex was
// written for — it matched the FIRST of the two leading asterisks as if it were a "* " bullet
// (its `\s*` allowed zero trailing whitespace), leaving a stray "*Label:** value" behind. Strip
// `**`/`__` emphasis markers globally first, then only treat a leading `-`/`*` as a bullet when
// it's actually followed by whitespace (a real bullet, not half of a bold-pair).
const stripMarkdownEmphasis = (text: string): string => text.replace(/\*\*/g, "").replace(/__/g, "");
const stripBullet = (line: string): string => line.replace(/^[-*]\s+/, "").trim();

const parseLabeledLines = (text: string): { label: string; value: string }[] =>
    text
        .split("\n")
        .map(line => stripBullet(stripMarkdownEmphasis(line.trim())))
        .filter(Boolean)
        .map(line => {
            const idx = line.indexOf(":");
            if (idx === -1) return null;
            const label = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            return label && value ? { label, value } : null;
        })
        .filter((x): x is { label: string; value: string } => x !== null);

const parseStringList = (text: string): string[] =>
    text
        .split("\n")
        .map(line => stripBullet(stripMarkdownEmphasis(line.trim())))
        .filter(Boolean);

const mergeLabeledFields = (existing: CodexCustomField[], parsed: { label: string; value: string }[]): CodexCustomField[] => {
    const merged = [...existing];
    for (const field of parsed) {
        const i = merged.findIndex(f => f.label.trim().toLowerCase() === field.label.trim().toLowerCase());
        if (i >= 0) merged[i] = { ...merged[i], value: field.value };
        else merged.push({ key: randomUUID(), label: field.label, value: field.value });
    }
    return merged;
};

const toStateItems = (values: string[]): CodexStateItem[] => values.map(value => ({ id: randomUUID(), value }));

// ── LLM extraction (only for sections whose deterministic parse comes up empty despite having
// real prose content) ────────────────────────────────────────────────────────────────────────

interface LlmSectionRequest {
    index: number;
    heading: string;
    kind: "labeledFields" | "labeledAppearance" | "stringList";
    text: string;
    allowedLabels?: string[];
    // Where a successful extraction should land — a codexState array name for "stringList", or
    // the deterministicLabeled map key ("appearance" or the section heading) for the other two.
    // Carried explicitly rather than re-derived from `heading`/`kind` at merge-back time.
    mergeKey: string;
}

interface LlmSectionResult {
    index: number;
    fields: { label: string; value: string }[] | null;
    list: string[] | null;
}

const LLM_SYSTEM_PROMPT = `You extract structured facts from prose written for a story bible section. For each numbered
input below, extract ONLY facts explicitly stated in the text — never invent or infer anything not
directly supported. Two possible response shapes per section, matching its stated kind:
- "labeledFields"/"labeledAppearance": an array of {label, value} facts. If "allowed labels" is given,
  use ONLY those exact labels (skip a label with no supporting text); otherwise choose your own short
  label per distinct fact (e.g. Age, Occupation, Hair, Eyes).
- "stringList": an array of short strings, one per distinct item/entry described.

Return ONLY a valid JSON array, one element per input section:
[{ "index": number, "fields": [{"label":string,"value":string}] | null, "list": string[] | null }]
Use null (not an empty array) for whichever of "fields"/"list" doesn't apply to that section's kind.`;

const parseLlmResults = (raw: string): LlmSectionResult[] => {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    let parsed: unknown[];
    try {
        parsed = JSON.parse(match[0]) as unknown[];
    } catch {
        return [];
    }
    return parsed
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .filter(e => typeof e.index === "number")
        .map(e => ({
            index: e.index as number,
            fields: Array.isArray(e.fields)
                ? (e.fields as unknown[])
                      .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
                      .filter(f => typeof f.label === "string" && typeof f.value === "string" && (f.value as string).trim())
                      .map(f => ({ label: f.label as string, value: (f.value as string).trim() }))
                : null,
            list: Array.isArray(e.list) ? (e.list as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0) : null
        }));
};

const runLlmExtraction = async (requests: LlmSectionRequest[]): Promise<Map<number, LlmSectionResult>> => {
    const results = new Map<number, LlmSectionResult>();
    if (requests.length === 0) return results;

    const connection = await buildClientForFeature("sheet_sync");
    if (!connection) return results; // no provider configured — fall back to deterministic-only results

    const { client, model } = connection;
    const userContent = requests
        .map(
            r =>
                `[${r.index}] (${r.kind}${r.allowedLabels ? `, allowed labels: ${r.allowedLabels.join(", ")}` : ""}) ${r.heading}\n${r.text}`
        )
        .join("\n\n");

    const completion = await client.chat.completions.create({
        model,
        messages: [
            { role: "system", content: LLM_SYSTEM_PROMPT },
            { role: "user", content: userContent }
        ],
        temperature: 0,
        max_tokens: 2048
    });

    for (const result of parseLlmResults(completion.choices[0]?.message?.content ?? "[]")) results.set(result.index, result);
    return results;
};

// ── Main entry point ─────────────────────────────────────────────────────────────────────────

export interface SyncSheetResult {
    success: boolean;
    message?: string;
    pendingChangeId?: string;
}

export const syncSheetToCodex = async (entryId: string, sheetBody: string, category: string): Promise<SyncSheetResult> => {
    const [entry] = await db.select().from(schema.lorebookEntries).where(eq(schema.lorebookEntries.id, entryId));
    if (!entry) return { success: false, message: "Entry not found" };

    const existingState = (entry.codexState as CodexState | null) ?? {
        wardrobe: [],
        appearance: [],
        wounds: [],
        items: [],
        customFields: []
    };

    // "note" has no section pack at all (freeform) — the whole sheet is the description.
    if (category === "note") {
        if (!sheetBody.trim()) return { success: false, message: "The Lore Sheet is empty — write something first" };
        const change = await proposeChange(entryId, { proposedDescription: sheetBody.trim() }, "ai", `sheet_sync:${entryId}:${Date.now()}`);
        return { success: true, pendingChangeId: change.id };
    }

    const sectionConfig = SECTION_CONFIGS[category] ?? {};
    const sections = splitSheetSections(sheetBody);
    if (sections.length === 0) return { success: false, message: "The Lore Sheet has no sections to sync yet" };

    // Location's structured half only applies once Codex tracking is on (see file header) —
    // every other category's non-narrative sections are simply skipped (their content stays
    // sheet-only until a future slice gives them a real structured target).
    const structuredEligible = category === "character" || (category === "location" && entry.codexEnabled);

    const narrativeParts: string[] = [];
    const llmRequests: LlmSectionRequest[] = [];
    const deterministicLabeled: Record<string, { label: string; value: string }[]> = {};
    const deterministicList: Record<string, string[]> = {};
    const singleValues: Record<string, string> = {};

    sections.forEach((section, index) => {
        const role = sectionConfig[section.heading.toLowerCase()];
        if (!role || !section.content) return;

        if (role.kind === "narrative") {
            narrativeParts.push(section.content);
            return;
        }
        if (!structuredEligible) return;

        if (role.kind === "singleValue") {
            singleValues[role.label] = section.content;
            return;
        }
        if (role.kind === "stringList") {
            const parsed = parseStringList(section.content);
            if (parsed.length > 0) deterministicList[role.target] = parsed;
            else llmRequests.push({ index, heading: section.heading, kind: "stringList", text: section.content, mergeKey: role.target });
            return;
        }
        // labeledFields / labeledAppearance
        const parsed = parseLabeledLines(section.content);
        const mergeKey = role.kind === "labeledAppearance" ? "appearance" : section.heading.toLowerCase();
        if (parsed.length > 0) deterministicLabeled[mergeKey] = parsed;
        else
            llmRequests.push({
                index,
                heading: section.heading,
                kind: role.kind,
                text: section.content,
                allowedLabels: role.kind === "labeledFields" ? role.allowedLabels : undefined,
                mergeKey
            });
    });

    const llmResults = await runLlmExtraction(llmRequests);
    for (const request of llmRequests) {
        const result = llmResults.get(request.index);
        if (!result) continue;
        if (request.kind === "stringList" && result.list?.length) deterministicList[request.mergeKey] = result.list;
        else if (result.fields?.length) deterministicLabeled[request.mergeKey] = result.fields;
    }

    const proposedDescription = narrativeParts.join("\n\n").trim();

    let proposedState: CodexState | undefined;
    if (structuredEligible) {
        const nextState: CodexState = { ...existingState };
        if (deterministicLabeled.appearance) nextState.appearance = mergeLabeledFields(existingState.appearance, deterministicLabeled.appearance);
        if (deterministicList.wardrobe) nextState.wardrobe = toStateItems(deterministicList.wardrobe);
        if (deterministicList.wounds) nextState.wounds = toStateItems(deterministicList.wounds);
        if (deterministicList.items) nextState.items = toStateItems(deterministicList.items);

        // Every other labeled bucket (character's "core identity", location's two fixed-label
        // sections) plus singleValue sections all land in customFields.
        const customFieldPatches: { label: string; value: string }[] = [];
        for (const [key, fields] of Object.entries(deterministicLabeled)) {
            if (key === "appearance") continue;
            customFieldPatches.push(...fields);
        }
        for (const [label, value] of Object.entries(singleValues)) customFieldPatches.push({ label, value });
        if (customFieldPatches.length > 0) nextState.customFields = mergeLabeledFields(existingState.customFields, customFieldPatches);

        if (JSON.stringify(nextState) !== JSON.stringify(existingState)) proposedState = nextState;
    }

    if (!proposedDescription && !proposedState)
        return { success: false, message: "Nothing new to sync — add content under a recognized section heading first" };

    const change = await proposeChange(
        entryId,
        { proposedDescription: proposedDescription || undefined, proposedState },
        "ai",
        `sheet_sync:${entryId}:${Date.now()}`
    );
    return { success: true, pendingChangeId: change.id };
};
