export const DEFAULT_SETTINGS = {
    hasLinkAttributes: false,
    isRichText: true,
    selectionAlwaysOnDisplay: false,
    shouldUseLexicalContextMenu: false
} as const;

export const INITIAL_SETTINGS: Record<SettingName, boolean> = {
    ...DEFAULT_SETTINGS
};

export type SettingName = keyof typeof DEFAULT_SETTINGS;
