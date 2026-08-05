import { isDarkThemeId, useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
    className?: string;
}

// Theme-aware Story Labyrinth wordmark, reused wherever a sparse brand moment is wanted outside
// the TopBar (login screen masthead, empty-page footers) — same asset pair TopBar.tsx uses.
export function BrandMark({ className }: BrandMarkProps) {
    const { theme } = useTheme();
    const wordmarkSrc = isDarkThemeId(theme) ? "/brand/wordmark-dark.png" : "/brand/wordmark-light.png";

    return <img src={wordmarkSrc} alt="Story Labyrinth" className={cn("w-auto", className)} />;
}
