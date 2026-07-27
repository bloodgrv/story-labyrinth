// Playbook Packs domain types — Character Guided Playbook Packs (Hybrid D).
// See docs/Character_Guided_Playbook_Packs_Design.md.

export type PlaybookKey = "character_codex" | "character_psych";
export type PlaybookStyle = "light" | "standard" | "grill" | "any";
export type PlaybookScope = "shipped" | "global" | "story";

export const PLAYBOOK_KEYS: PlaybookKey[] = ["character_codex", "character_psych"];
export const PLAYBOOK_STYLES: PlaybookStyle[] = ["light", "standard", "grill", "any"];
export const PLAYBOOK_SCOPES: PlaybookScope[] = ["shipped", "global", "story"];

export interface PlaybookPack {
    id: string;
    playbookKey: PlaybookKey;
    style: PlaybookStyle;
    packScope: PlaybookScope;
    storyId: string | null;
    title: string;
    body: string;
    sourcePackId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
