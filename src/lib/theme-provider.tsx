import { createContext, useContext, useEffect, useState } from "react";

export type Theme =
    | "light"
    | "system"
    | "sepia"
    | "midnight"
    | "midnight-graphite"
    | "forest"
    | "sand"
    | "bone"
    | "dark-parchment"
    | "abyss"
    | "matrix"
    | "ember"
    | "mid-stone"
    | "mid-slate"
    | "mid-sage";

// Theme ids double as the class name applied to <html> (except "system", which resolves to a
// concrete theme below). Keep in sync with the palettes defined in index.css.
// Mist, Graphite, and the old plain "Dark" theme were removed 2026-08-04 (user request — Mist
// and Graphite dropped outright, "Dark" felt redundant next to Midnight/Abyss/etc). "system"'s
// dark-preference branch now resolves to "midnight" instead of the removed "dark" id — see
// getSystemTheme() below.
export const THEME_OPTIONS: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "bone", label: "Bone" },
    { id: "sepia", label: "Sepia" },
    { id: "mid-stone", label: "Mid Stone" },
    { id: "mid-slate", label: "Mid Slate" },
    { id: "mid-sage", label: "Mid Sage" },
    { id: "sand", label: "Black & Sand" },
    { id: "dark-parchment", label: "Dark Parchment" },
    { id: "midnight", label: "Midnight" },
    { id: "midnight-graphite", label: "Eclipse" },
    { id: "abyss", label: "Abyss" },
    { id: "ember", label: "Ember" },
    { id: "forest", label: "Forest" },
    { id: "matrix", label: "Matrix" },
    { id: "system", label: "System" }
];

const THEME_CLASSES = THEME_OPTIONS.map(o => o.id).filter(id => id !== "system");

// Dark-family themes (--background lightness < 50%, per src/index.css) vs light-family
// (>= 50%) — used to pick theme-aware brand assets (e.g. TopBar wordmark) since this app
// has many custom palettes beyond a plain light/dark binary. Also drives the auxiliary
// literal "dark" class (see ThemeProvider below) that Tailwind's own `dark:` variant utilities
// key off — every dark-family theme should trigger those, not just one specific theme id.
const DARK_THEME_IDS = new Set<Theme>([
    "midnight",
    "midnight-graphite",
    "sand",
    "forest",
    "dark-parchment",
    "abyss",
    "matrix",
    "ember"
]);

export const isDarkThemeId = (theme: Theme): boolean =>
    theme === "system" ? getSystemTheme() === "midnight" : DARK_THEME_IDS.has(theme);

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

// "system" resolves to a concrete theme id — Midnight stands in for the old plain "Dark" theme
// (removed 2026-08-04) as the OS dark-preference target.
const getSystemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "midnight" : "light");

// One-time migration for anyone with a removed theme id (dark/mist/graphite) still in
// localStorage from before 2026-08-04 — otherwise it'd silently apply no matching CSS block.
const REMOVED_THEME_MIGRATIONS: Record<string, Theme> = {
    dark: "midnight",
    graphite: "midnight",
    mist: "light"
};

function resolveStoredTheme(raw: string | null, fallback: Theme): Theme {
    if (!raw) return fallback;
    return (REMOVED_THEME_MIGRATIONS[raw] as Theme | undefined) ?? (raw as Theme);
}

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => resolveStoredTheme(localStorage.getItem(storageKey), defaultTheme));

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(...THEME_CLASSES);
        const appliedTheme = theme === "system" ? getSystemTheme() : theme;
        root.classList.add(appliedTheme);
        // Auxiliary literal "dark" class: Tailwind's own `darkMode: ["class"]` config keys every
        // `dark:` utility off this exact class name, independent of which specific palette class
        // is also applied — every dark-family theme should trigger those utilities, not just one.
        root.classList.toggle("dark", DARK_THEME_IDS.has(appliedTheme));
        localStorage.setItem(storageKey, theme);
    }, [theme, storageKey]);

    useEffect(() => {
        if (theme !== "system") return;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            const root = window.document.documentElement;
            root.classList.remove(...THEME_CLASSES);
            const appliedTheme = getSystemTheme();
            root.classList.add(appliedTheme);
            root.classList.toggle("dark", DARK_THEME_IDS.has(appliedTheme));
        };
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => setTheme(theme)
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

    return context;
};
