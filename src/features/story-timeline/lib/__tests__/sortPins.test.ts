import { describe, expect, it } from "vitest";
import type { TimelinePin } from "@/types/storyTimeline";
import { groupPinsByTier, pinTier, sortPins } from "../sortPins";

// Minimal pin factory — only the fields sortPins/pinTier actually read vary per test, everything
// else is filler to satisfy the TimelinePin shape.
const pin = (overrides: Partial<TimelinePin> & Pick<TimelinePin, "id" | "title">): TimelinePin => ({
    storyId: "story-1",
    blurb: null,
    manualOrder: 0,
    linkType: null,
    linkId: null,
    status: "active",
    source: "user",
    manuscriptStatus: "planned",
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [],
    whenKind: "fuzzy",
    relativeOffsetYears: null,
    fuzzyPhrase: null,
    civilDate: null,
    ...overrides
});

describe("pinTier", () => {
    it("classifies civil > relative > fuzzy in priority order", () => {
        expect(pinTier({ civilDate: "1200", relativeOffsetYears: 5 })).toBe("civil");
        expect(pinTier({ civilDate: null, relativeOffsetYears: 5 })).toBe("relative");
        expect(pinTier({ civilDate: null, relativeOffsetYears: null })).toBe("fuzzy");
    });
});

describe("sortPins", () => {
    it("groups civil before relative before fuzzy, regardless of input order", () => {
        const fuzzy = pin({ id: "1", title: "Fuzzy", whenKind: "fuzzy", manualOrder: 0 });
        const civil = pin({ id: "2", title: "Civil", whenKind: "civil", civilDate: "1500" });
        const relative = pin({ id: "3", title: "Relative", whenKind: "relative", relativeOffsetYears: 10 });
        const result = sortPins([fuzzy, civil, relative]);
        expect(result.map(p => p.id)).toEqual(["2", "3", "1"]);
    });

    it("sorts civil pins by parsed date", () => {
        const late = pin({ id: "a", title: "Late", whenKind: "civil", civilDate: "1800" });
        const early = pin({ id: "b", title: "Early", whenKind: "civil", civilDate: "1200" });
        expect(sortPins([late, early]).map(p => p.id)).toEqual(["b", "a"]);
    });

    it("keeps the Story-start marker (offset 0) fixed among relative pins", () => {
        const before = pin({ id: "a", title: "Before", whenKind: "relative", relativeOffsetYears: -50 });
        const start = pin({ id: "b", title: "Story Start", whenKind: "relative", relativeOffsetYears: 0 });
        const after = pin({ id: "c", title: "After", whenKind: "relative", relativeOffsetYears: 50 });
        expect(sortPins([after, start, before]).map(p => p.id)).toEqual(["a", "b", "c"]);
    });

    it("sorts fuzzy pins by manualOrder", () => {
        const second = pin({ id: "a", title: "Second", whenKind: "fuzzy", manualOrder: 1 });
        const first = pin({ id: "b", title: "First", whenKind: "fuzzy", manualOrder: 0 });
        expect(sortPins([second, first]).map(p => p.id)).toEqual(["b", "a"]);
    });

    it("breaks exact ties by id for stability", () => {
        const b = pin({ id: "b", title: "B", whenKind: "fuzzy", manualOrder: 5 });
        const a = pin({ id: "a", title: "A", whenKind: "fuzzy", manualOrder: 5 });
        expect(sortPins([b, a]).map(p => p.id)).toEqual(["a", "b"]);
    });
});

describe("groupPinsByTier", () => {
    it("groups an already-sorted list into contiguous tier buckets", () => {
        const civil = pin({ id: "1", title: "C", whenKind: "civil", civilDate: "1200" });
        const relative1 = pin({ id: "2", title: "R1", whenKind: "relative", relativeOffsetYears: 0 });
        const relative2 = pin({ id: "3", title: "R2", whenKind: "relative", relativeOffsetYears: 5 });
        const fuzzy = pin({ id: "4", title: "F", whenKind: "fuzzy" });
        const groups = groupPinsByTier(sortPins([civil, relative1, relative2, fuzzy]));
        expect(groups.map(g => [g.tier, g.pins.length])).toEqual([
            ["civil", 1],
            ["relative", 2],
            ["fuzzy", 1]
        ]);
    });
});
