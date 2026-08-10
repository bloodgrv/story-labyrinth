import type { LorebookCategory } from "./entryFormUtils";

export interface SheetSection {
    heading: string;
    // Optional sections are never part of the auto-seed (new entry / lazy-open-of-empty-sheet)
    // template — only required sections are. "Insert template" (the explicit user action) inserts
    // both. See docs/Lore_Sheet_And_Sync_Design.md §3/§4.
    optional?: boolean;
}

// Per-category Lore Sheet section packs — docs/Lore_Sheet_And_Sync_Design.md §3 (character) / §4
// (other categories). Section text/order matches those tables verbatim. "note" has no fixed pack
// (§4: "Free `##` sections") — freeform markdown, no outline/insert-template affordance.
const SHEET_TEMPLATES: Record<LorebookCategory, SheetSection[]> = {
    character: [
        { heading: "Core Identity" },
        { heading: "Physical Appearance" },
        { heading: "Wardrobe", optional: true },
        { heading: "Personality & Temperament" },
        { heading: "Background & Lifestyle" },
        { heading: "Friends & Family", optional: true },
        { heading: "Character Motivations" },
        { heading: "Wounds / Marks", optional: true },
        { heading: "Items / Possessions", optional: true }
    ],
    location: [
        { heading: "Overview" },
        { heading: "Scale & Nature" },
        { heading: "Holder & Control" },
        { heading: "Landmarks" },
        { heading: "Exits & Links" },
        { heading: "Layout Notes" },
        { heading: "Atmosphere" }
    ],
    item: [
        { heading: "Overview" },
        { heading: "Appearance" },
        { heading: "Properties" },
        { heading: "History" },
        { heading: "Ownership" }
    ],
    event: [
        { heading: "Summary" },
        { heading: "When" },
        { heading: "Where" },
        { heading: "Who" },
        { heading: "Outcome" },
        { heading: "Aftermath" }
    ],
    note: [],
    synopsis: [{ heading: "Logline" }, { heading: "Summary" }, { heading: "Themes" }, { heading: "Scope" }],
    "starting scenario": [
        { heading: "Situation" },
        { heading: "Stakes" },
        { heading: "Opening Image" },
        { heading: "Constraints" }
    ],
    timeline: [{ heading: "Summary" }, { heading: "Era" }, { heading: "Sequence Notes" }]
};

export const getSheetTemplate = (category: LorebookCategory): SheetSection[] => SHEET_TEMPLATES[category] ?? [];

// Deterministic `##` heading scan — no full markdown parse, matches the doctrine the Sync loop
// (FS3) will also use for its own deterministic split. Returns heading text (trimmed) + the
// character offset the heading line starts at, in document order.
export const parseSheetHeadings = (sheetBody: string): { heading: string; index: number }[] => {
    const headings: { heading: string; index: number }[] = [];
    const regex = /^##\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sheetBody)) !== null) headings.push({ heading: match[1].trim(), index: match.index });
    return headings;
};

const appendHeading = (sheetBody: string, heading: string): string => {
    const prefix = sheetBody.trim().length > 0 ? sheetBody.replace(/\s*$/, "\n\n") : "";
    return `${prefix}## ${heading}\n\n`;
};

// New-entry seed / lazy-open-of-empty-sheet seed (FS1's own scope) — required sections only, in
// canonical order. Deliberately does NOT read the entry's existing description/Codex state; that
// smarter reverse-compile is FS2's job, layered on top of this same seed as a fallback.
export const buildEmptySheetSeed = (category: LorebookCategory): string => {
    const required = getSheetTemplate(category).filter(section => !section.optional);
    return required.reduce((body, section) => appendHeading(body, section.heading), "");
};

// "Insert template" — appends every section (required + optional) not already present, by
// case-insensitive heading match, preserving whatever the user already wrote.
export const appendMissingSections = (sheetBody: string, category: LorebookCategory): string => {
    const present = new Set(parseSheetHeadings(sheetBody).map(h => h.heading.toLowerCase()));
    const missing = getSheetTemplate(category).filter(section => !present.has(section.heading.toLowerCase()));
    return missing.reduce((body, section) => appendHeading(body, section.heading), sheetBody);
};

// Insert a single missing section (outline's per-item "+ Add section" click).
export const appendSection = (sheetBody: string, heading: string): string => appendHeading(sheetBody, heading);
