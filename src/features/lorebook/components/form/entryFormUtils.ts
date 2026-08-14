import type { CodexState, DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry, PlaceState } from "@/types/story";
import { reverseCompileSheet } from "./reverseCompileSheet";
import { buildEmptySheetSeed } from "./sheetTemplates";

export const EMPTY_PLACE_STATE: PlaceState = {};

export type LorebookLevel = LorebookEntry["level"];
export type LorebookCategory = LorebookEntry["category"];

export const EMPTY_CODEX_STATE: CodexState = { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [], secrets: [] };

const hasCodexContent = (state: CodexState): boolean =>
    state.wardrobe.length > 0 ||
    state.appearance.length > 0 ||
    state.wounds.length > 0 ||
    state.items.length > 0 ||
    state.customFields.length > 0;

export const CATEGORIES: LorebookCategory[] = [
    "character",
    "location",
    "item",
    "event",
    "note",
    "synopsis",
    "starting scenario",
    "timeline"
];

export const IMPORTANCE_LEVELS = ["major", "minor", "background"] as const;
export const STATUS_OPTIONS = ["active", "inactive", "historical"] as const;

type ImportanceLevel = (typeof IMPORTANCE_LEVELS)[number];
type StatusOption = (typeof STATUS_OPTIONS)[number];

export interface CreateEntryForm {
    level: LorebookLevel;
    scopeId: string;
    name: string;
    category: LorebookCategory;
    importance: ImportanceLevel;
    tags: string;
    description: string;
    type: string;
    status: StatusOption;
    isDisabled: boolean;
    // Concrete physical state (wardrobe/appearance/wounds/items/customFields) — see
    // CodexStateEditor.tsx. Submitted separately from the rest of this form, through
    // codexApi.enable/recordState, not through buildSubmitData below.
    codexEnabled: boolean;
    codexState: CodexState;
    // undefined = no change, File = a newly-picked image to upload, null = explicitly removed.
    // Never pre-populated from an existing entry's image — that's displayed via its own URL
    // (lorebookApi.imageUrl), not re-uploaded. See ImageUploadField.tsx.
    imageFile?: File | null;
    // true = generate a new image from the description on save (lorebookApi.generateImage).
    // Mutually exclusive with imageFile — picking one clears the other. See ImageUploadField.tsx.
    generateImageOnSave?: boolean;
    // Which prompt preset to use when generateImageOnSave is true — "mood" (default, current
    // description-driven path) or "map" (location-only, top-down/ink style, see
    // grokImageService.ts's MAP_IMAGE_PROMPT_PREFIX). Only ever shown for category="location".
    generateImagePreset?: "mood" | "map";
    // Location template's light place sheet (L1) — only rendered/relevant for category="location"
    // (PlaceSheetFields.tsx), submitted into metadata.placeState alongside the rest of the form.
    placeState: PlaceState;
    // Lore Sheet (T5, docs/Lore_Sheet_And_Sync_Design.md) — sheet-first source of truth; see
    // LoreSheetEditor.tsx/sheetTemplates.ts. Submitted as a plain top-level column (buildSubmitData
    // below), not part of metadata.
    sheetBody: string;
}

// Synchronous data-URL -> File conversion (no fetch/Blob round trip needed) so a draft's
// extracted image can seed useForm's synchronous `defaultValues` directly.
const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const [meta, base64] = dataUrl.split(",");
    const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
};

// `draft` seeds a brand-new entry from an AI-extracted document import (see
// documentImportService.ts) — only consulted when `entry` is absent, since an existing entry's
// own saved values always win.
export const getDefaultFormValues = (
    entry?: LorebookEntry,
    seriesId?: string,
    storyId?: string,
    defaultCategory?: LorebookCategory,
    draft?: DocumentImportDraft
): CreateEntryForm => {
    const defaultLevel: LorebookLevel = entry?.level || (seriesId ? "series" : "story");
    const defaultScopeId = entry?.scopeId || seriesId || storyId || "";
    // `secrets` is spread in explicitly since it's optional on CodexState (2026-08-14) — an
    // existing saved entry from before this feature has a real codexState object with no
    // `secrets` key at all, and useFieldArray on "codexState.secrets" needs a defined array.
    const codexState: CodexState = { ...(entry?.codexState ?? draft?.codexState ?? EMPTY_CODEX_STATE), secrets: entry?.codexState?.secrets ?? draft?.codexState?.secrets ?? [] };
    const resolvedCategory: LorebookCategory = entry?.category || draft?.category || defaultCategory || "character";
    // Lore Sheet seed (T5 FS1/FS2/FS7) — an existing entry's own sheetBody always wins. Otherwise:
    // an existing entry that predates this feature (entry.sheetBody null/empty) gets FS2's
    // deterministic reverse compile from its existing description/codexState/placeState instead of
    // a blank template — real data, not just headings. A document-import draft (FS7) gets the same
    // deterministic reverse compile, fed from what the draft itself already extracted
    // (name/description/codexState) — reuses the exact same proven, no-AI compiler rather than a
    // second LLM extraction pass; the sheet's own "Improve with AI" button is still there
    // afterward if the user wants a nicer pass over it. Only a genuinely brand-new, undrafted entry
    // falls back to the blank required-section template.
    const sheetBody = entry?.sheetBody
        ? entry.sheetBody
        : entry
          ? reverseCompileSheet(entry)
          : draft
            ? reverseCompileSheet({ category: resolvedCategory, description: draft.description, codexState: draft.codexState })
            : buildEmptySheetSeed(resolvedCategory);

    return {
        level: defaultLevel,
        scopeId: defaultScopeId,
        name: entry?.name || draft?.name || "",
        category: resolvedCategory,
        importance: entry?.metadata?.importance || "minor",
        tags: entry?.tags?.join(", ") || draft?.tags?.join(", ") || "",
        description: entry?.description || draft?.description || "",
        type: entry?.metadata?.type || "",
        status: entry?.metadata?.status || "active",
        isDisabled: entry?.isDisabled || false,
        codexEnabled: entry?.codexEnabled ?? hasCodexContent(codexState),
        codexState,
        imageFile: !entry && draft?.image ? dataUrlToFile(draft.image.dataUrl, draft.image.filename) : undefined,
        generateImagePreset: "mood",
        placeState: entry?.metadata?.placeState ?? EMPTY_PLACE_STATE,
        sheetBody
    };
};

// `entry` (when editing) is spread in first so metadata keys this form doesn't know about —
// psychProfile, placeState, and any future chat-proposal-only fields — survive a normal save.
// The generic PUT route (server/lib/crud.ts) replaces the whole metadata column wholesale, it
// doesn't merge, so omitting this spread silently wipes those keys on every edit-and-save.
// relationships stays force-reset to [] regardless — intentional (P2 bug B5: the graph edge
// table is SoT now, metadata.relationships is legacy and never re-depended on).
export const buildSubmitData = (data: CreateEntryForm, entry?: LorebookEntry) => {
    const processedTags = data.tags
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);

    return {
        name: data.name,
        description: data.description,
        category: data.category,
        tags: processedTags,
        isDisabled: data.isDisabled,
        sheetBody: data.sheetBody,
        metadata: {
            ...entry?.metadata,
            importance: data.importance,
            status: data.status,
            type: data.type,
            relationships: [],
            ...(data.category === "location" ? { placeState: data.placeState } : {})
        },
        level: data.level,
        scopeId: data.level === "global" ? undefined : data.scopeId
    };
};
