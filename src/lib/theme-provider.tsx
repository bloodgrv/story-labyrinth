import { createContext, useContext, useEffect, useState } from "react";

export type Theme =
    | "dark"
    | "light"
    | "system"
    | "sepia"
    | "midnight"
    | "midnight-graphite"
    | "forest"
    | "sand"
    | "graphite"
    | "mist"
    | "bone"
    | "dark-parchment"
    | "abyss"
    | "matrix"
    | "ember"
    | "mid-stone"
    | "mid-slate"
    | "mid-sage";

// Theme ids double as the class name applied to <html> (except "system", which resolves to
// light/dark). Keep in sync with the palettes defined in index.css.
export const THEME_OPTIONS: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "mist", label: "Mist" },
    { id: "bone", label: "Bone" },
    { id: "sepia", label: "Sepia" },
    { id: "mid-stone", label: "Mid Stone" },
    { id: "mid-slate", label: "Mid Slate" },
    { id: "mid-sage", label: "Mid Sage" },
    { id: "graphite", label: "Graphite" },
    { id: "dark", label: "Dark" },
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
// has many custom palettes beyond a plain light/dark binary.
const DARK_THEME_IDS = new Set<Theme>([
    "dark",
    "midnight",
    "midnight-graphite",
    "sand",
    "graphite",
    "forest",
    "dark-parchment",
    "abyss",
    "matrix",
    "ember"
]);

export const isDarkThemeId = (theme: Theme): boolean =>
    theme === "system" ? getSystemTheme() === "dark" : DARK_THEME_IDS.has(theme);

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

const getSystemTheme = () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(...THEME_CLASSES);
        const appliedTheme = theme === "system" ? getSystemTheme() : theme;
        root.classList.add(appliedTheme);
        localStorage.setItem(storageKey, theme);
    }, [theme, storageKey]);

    useEffect(() => {
        if (theme !== "system") return;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
            const root = window.document.documentElement;
            root.classList.remove(...THEME_CLASSES);
            root.classList.add(getSystemTheme());
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
