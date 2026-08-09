import type { CodexState } from "@/types/codex";
import type { PlaceState } from "@/types/story";
import type { LorebookCategory } from "./entryFormUtils";
import { getSheetTemplate } from "./sheetTemplates";

// Narrowed to exactly what reverseCompileSheet reads (category/description/codexState/
// metadata.placeState) rather than the full `LorebookEntry` — T5 FS7 needs to reverse-compile a
// document-import draft, which has no id/level/scopeId/createdAt/etc. yet (it isn't a real entry
// until the user saves it), and this is a structurally-compatible subset any real `LorebookEntry`
// already satisfies, so every existing call site keeps working unchanged.
export interface ReverseCompileSource {
    category: LorebookCategory;
    description?: string;
    codexState?: CodexState | null;
    metadata?: { placeState?: PlaceState };
}

// Per-category "catch-all" heading where an entry's existing free-text `description` lands on
// reverse compile — docs/Lore_Sheet_And_Sync_Design.md §8/§9a: "description → Overview or
// Personality block". Character has no "Overview" heading (its first narrative section is
// Personality & Temperament), every other category does (or "Summary"/"Situation" as its own
// first section). `note` has no template at all (§4: "Free `##` sections") — its description
// becomes the whole sheet body verbatim, no heading wrapper.
const NARRATIVE_CATCH_ALL: Partial<Record<LorebookCategory, string>> = {
    character: "Personality & Temperament",
    location: "Overview",
    item: "Overview",
    event: "Summary",
    synopsis: "Summary",
    "starting scenario": "Situation",
    timeline: "Summary"
};

const bulletLines = (pairs: { label: string; value: string }[]): string =>
    pairs
        .filter(pair => pair.value?.trim())
        .map(pair => `- ${pair.label}: ${pair.value.trim()}`)
        .join("\n");

const bulletList = (items: string[]): string => items.filter(item => item?.trim()).map(item => `- ${item.trim()}`).join("\n");

// FS1's own lazy-open seed only ever produces a blank required-section template. This is the
// smarter fallback FS2 adds on top of it: deterministic (no AI) reverse compile of whatever
// structured data an entry already has — codexState for character, metadata.placeState for
// location, plain `description` for everything else — into the same per-category sheet shape.
// Never invents content; a section with nothing to reverse-compile just renders as an empty
// heading (or is omitted entirely, for optional sections with no source data — same "optional
// sections aren't auto-seeded empty" rule FS1's buildEmptySheetSeed already follows).
export const reverseCompileSheet = (entry: ReverseCompileSource): string => {
    const category = entry.category;

    if (category === "note") return entry.description?.trim() ?? "";

    const sections = new Map<string, string>();
    const catchAllHeading = NARRATIVE_CATCH_ALL[category];
    if (catchAllHeading && entry.description?.trim()) sections.set(catchAllHeading.toLowerCase(), entry.description.trim());

    if (category === "character" && entry.codexState) {
        const state = entry.codexState;
        const identity = bulletLines(state.customFields ?? []);
        if (identity) sections.set("core identity", identity);
        const appearance = bulletLines(state.appearance ?? []);
        if (appearance) sections.set("physical appearance", appearance);
        const wardrobe = bulletList((state.wardrobe ?? []).map(item => item.value));
        if (wardrobe) sections.set("wardrobe", wardrobe);
        const wounds = bulletList((state.wounds ?? []).map(item => item.value));
        if (wounds) sections.set("wounds / marks", wounds);
        const items = bulletList((state.items ?? []).map(item => item.value));
        if (items) sections.set("items / possessions", items);
    }

    if (category === "location" && entry.metadata?.placeState) {
        const place = entry.metadata.placeState;
        const scaleNature = [place.scale && `Scale: ${place.scale}`, place.biomeOrClimate && `Biome/climate: ${place.biomeOrClimate}`]
            .filter(Boolean)
            .join("\n");
        if (scaleNature) sections.set("scale & nature", scaleNature);
        const holderControl = [place.holder && `Holder: ${place.holder}`, place.dangerLevel && `Danger level: ${place.dangerLevel}`]
            .filter(Boolean)
            .join("\n");
        if (holderControl) sections.set("holder & control", holderControl);
        const landmarks = bulletList(place.landmarks ?? []);
        if (landmarks) sections.set("landmarks", landmarks);
        if (place.exitsSummary?.trim()) sections.set("exits & links", place.exitsSummary.trim());
        if (place.layoutMd?.trim()) sections.set("layout notes", place.layoutMd.trim());
    }

    const template = getSheetTemplate(category);
    if (template.length === 0) return entry.description?.trim() ?? "";

    const headingsToEmit = template.filter(section => !section.optional || sections.has(section.heading.toLowerCase()));

    return headingsToEmit
        .map(section => {
            const content = sections.get(section.heading.toLowerCase());
            return content ? `## ${section.heading}\n\n${content}\n\n` : `## ${section.heading}\n\n`;
        })
        .join("");
};
