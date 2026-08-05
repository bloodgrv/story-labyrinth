import {
    BookOpen,
    Check,
    Cloud,
    Flame,
    Layers,
    Leaf,
    Monitor,
    MoonStar,
    Mountain,
    Palmtree,
    ScrollText,
    Sparkles,
    Sun,
    Terminal,
    Trees,
    Waves
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { THEME_OPTIONS, useTheme, type Theme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
    isExpanded?: boolean;
}

const THEME_ICONS: Record<Theme, typeof Sun> = {
    light: Sun,
    bone: Cloud,
    "theme-sepia": ScrollText,
    "mid-stone": Layers,
    "mid-slate": Mountain,
    "mid-sage": Trees,
    sand: Palmtree,
    "dark-parchment": BookOpen,
    midnight: Sparkles,
    "midnight-graphite": MoonStar,
    abyss: Waves,
    ember: Flame,
    forest: Leaf,
    matrix: Terminal,
    system: Monitor
};

export function ThemeToggle({ isExpanded = false }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const { label } = THEME_OPTIONS.find(option => option.id === theme) ?? THEME_OPTIONS[0];
    const Icon = THEME_ICONS[theme] ?? Monitor;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size={isExpanded ? "default" : "icon"}
                    className={cn(
                        "relative hover:bg-accent hover:text-accent-foreground",
                        isExpanded ? "justify-start w-full px-3" : "h-9 w-9"
                    )}
                    title={`Theme: ${label}`}
                >
                    <div className="flex items-center">
                        <Icon className="h-5 w-5" />
                        {isExpanded && <span className="ml-2">{label}</span>}
                    </div>
                    <span className="sr-only">Change theme (current: {label})</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isExpanded ? "start" : "center"} className="max-h-[70vh] overflow-y-auto">
                {THEME_OPTIONS.map(option => {
                    const OptionIcon = THEME_ICONS[option.id] ?? Monitor;
                    return (
                        <DropdownMenuItem key={option.id} onClick={() => setTheme(option.id)} className="gap-2">
                            <OptionIcon className="h-4 w-4" />
                            <span className="flex-1">{option.label}</span>
                            {theme === option.id && <Check className="h-4 w-4" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
