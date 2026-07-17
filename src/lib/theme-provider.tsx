import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system" | "sepia" | "midnight" | "forest" | "sand" | "graphite";

// Theme ids double as the class name applied to <html> (except "system", which resolves to
// light/dark). Keep in sync with the palettes defined in index.css.
export const THEME_OPTIONS: { id: Theme; label: string }[] = [
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
    { id: "sepia", label: "Sepia" },
    { id: "midnight", label: "Midnight" },
    { id: "forest", label: "Forest" },
    { id: "sand", label: "Black & Sand" },
    { id: "graphite", label: "Graphite" },
    { id: "system", label: "System" }
];

const THEME_CLASSES = ["light", "dark", "sepia", "midnight", "forest", "sand", "graphite"];

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
