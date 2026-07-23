import type { PlaceState } from "@/types/story";

// L4, docs/Locations_And_Maps_Design.md — the field-label mapping shared by
// PlaceCodexStateEditor.tsx's toggle-on prefill and ChatInterface.tsx's handleAcceptPlaceSheet
// (once an entry is codexEnabled, a place-sheet-proposal fence writes here instead of directly
// into metadata.placeState). Kept as one ordered list so both call sites stay in sync — landmarks
// maps to codexState.items (a plain string list) rather than a labeled row.
const PLACE_STATE_FIELD_LABELS: Array<[keyof PlaceState, string]> = [
    ["scale", "Scale"],
    ["biomeOrClimate", "Biome / Climate"],
    ["holder", "Holder"],
    ["dangerLevel", "Danger Level"],
    ["exitsSummary", "Exits Summary"],
    ["layoutMd", "Layout"],
    ["imageBrief", "Image Brief"],
    ["floorLabel", "Floor"]
];

export interface PlaceCodexFields {
    customFields: Array<{ key: string; label: string; value: string }>;
    items: Array<{ id: string; value: string }>;
}

// Converts a (possibly partial) PlaceState into the customFields/items shape codexState expects —
// only non-empty fields are included, so a partial chat proposal never stamps blank rows.
export const placeStateToCodexFields = (placeState: PlaceState | undefined | null): PlaceCodexFields => {
    const customFields: PlaceCodexFields["customFields"] = [];
    for (const [key, label] of PLACE_STATE_FIELD_LABELS) {
        const value = placeState?.[key];
        if (typeof value === "string" && value.trim()) customFields.push({ key, label, value: value.trim() });
    }
    const items = (placeState?.landmarks ?? []).map(value => ({ id: crypto.randomUUID(), value }));
    return { customFields, items };
};
