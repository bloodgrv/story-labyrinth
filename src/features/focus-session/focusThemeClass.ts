import type { FocusThemeId } from "@/types/focusSession";
import "./theme/FocusThemes.css";

// "default" maps to no class at all — it just inherits the app's normal light/dark theme
// variables (see index.css), so picking it can never fight the global ThemeToggle. The other
// three are scoped CSS-variable overrides (see FocusThemes.css) applied only to the wrapper
// around the editor while a session is active — never to <html>/<body> — so the rest of the app
// (which is hidden during a session anyway) is never affected.
export const FOCUS_THEME_CLASS: Record<FocusThemeId, string | null> = {
    default: null,
    warm: "focus-theme-warm",
    lowContrast: "focus-theme-low-contrast",
    night: "focus-theme-night"
};
