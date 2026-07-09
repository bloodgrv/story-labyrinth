import type { CodexState, DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";

export type LorebookLevel = LorebookEntry["level"];
export type LorebookCategory = LorebookEntry["category"];

export const EMPTY_CODEX_STATE: CodexState = { wardrobe: [], appearance: [], wounds: [], items: [], customFields: [] };

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
}

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
    const codexState = entry?.codexState ?? draft?.codexState ?? EMPTY_CODEX_STATE;

    return {
        level: defaultLevel,
        scopeId: defaultScopeId,
        name: entry?.name || draft?.name || "",
        category: entry?.category || draft?.category || defaultCategory || "character",
        importance: entry?.metadata?.importance || "minor",
        tags: entry?.tags?.join(", ") || draft?.tags?.join(", ") || "",
        description: entry?.description || draft?.description || "",
        type: entry?.metadata?.type || "",
        status: entry?.metadata?.status || "active",
        isDisabled: entry?.isDisabled || false,
        codexEnabled: entry?.codexEnabled ?? hasCodexContent(codexState),
        codexState
    };
};

export const buildSubmitData = (data: CreateEntryForm) => {
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
        metadata: {
            importance: data.importance,
            status: data.status,
            type: data.type,
            relationships: []
        },
        level: data.level,
        scopeId: data.level === "global" ? undefined : data.scopeId
    };
};
