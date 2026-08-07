import type { TimelinePin } from "@/types/storyTimeline";

// Story Timeline (T6, TL2, docs/Story_Timeline_Design.md) — sort pipeline. Three strict tiers,
// each fully resolved before the next, reading the design doc's "civil when present ->
// relative-to-start -> fuzzy bucket + manual order -> stable id" line as priority TIERS rather
// than one blended numeric axis: mixing real calendar dates and relative-to-start years on one
// scale has no principled conversion without a resolved civil anchor (out of scope this pass).
// Documented as a locked-for-now implementer call in DECISIONS.md.
export type PinTier = "civil" | "relative" | "fuzzy";

export const pinTier = (pin: Pick<TimelinePin, "civilDate" | "relativeOffsetYears">): PinTier => {
    if (pin.civilDate) return "civil";
    if (pin.relativeOffsetYears != null) return "relative";
    return "fuzzy";
};

const parseCivilDate = (value: string): number => {
    // Bare year ("1890") parses fine via Date.parse when suffixed; full ISO dates pass through.
    const parsed = Date.parse(/^-?\d+$/.test(value.trim()) ? `${value.trim()}-01-01` : value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const compareWithinTier = (a: TimelinePin, b: TimelinePin, tier: PinTier): number => {
    if (tier === "civil") return parseCivilDate(a.civilDate ?? "") - parseCivilDate(b.civilDate ?? "");
    if (tier === "relative") return (a.relativeOffsetYears ?? 0) - (b.relativeOffsetYears ?? 0);
    return a.manualOrder - b.manualOrder;
};

// Sorted, tier-grouped pins for board rendering — civil group first, then relative (where the
// Story-start marker always sits at relativeOffsetYears=0 by definition), then fuzzy/unordered.
export const sortPins = (pins: TimelinePin[]): TimelinePin[] => {
    const tierRank: Record<PinTier, number> = { civil: 0, relative: 1, fuzzy: 2 };
    return [...pins].sort((a, b) => {
        const tierA = pinTier(a);
        const tierB = pinTier(b);
        if (tierA !== tierB) return tierRank[tierA] - tierRank[tierB];
        const cmp = compareWithinTier(a, b, tierA);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
};

// Groups the already-sorted pin list by tier, for rendering tier dividers/labels on the board.
export const groupPinsByTier = (sortedPins: TimelinePin[]): { tier: PinTier; pins: TimelinePin[] }[] => {
    const groups: { tier: PinTier; pins: TimelinePin[] }[] = [];
    for (const pin of sortedPins) {
        const tier = pinTier(pin);
        const last = groups[groups.length - 1];
        if (last?.tier === tier) last.pins.push(pin);
        else groups.push({ tier, pins: [pin] });
    }
    return groups;
};
