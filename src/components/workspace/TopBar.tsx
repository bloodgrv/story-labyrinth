import { HelpCircle, Search, Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { ActivityStoplight } from "@/features/activity/components/ActivityStoplight";
import { AiActivityIndicator } from "@/features/activity/components/AiActivityIndicator";
import { useAiActivity, useAiOneShotActivity } from "@/features/activity/store/aiActivityStore";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useStoriesQuery } from "@/features/stories/hooks/useStoriesQuery";
import { isDarkThemeId, useTheme } from "@/lib/theme-provider";
import { ChapterSwitcher } from "./ChapterSwitcher";

interface TopBarProps {
    onOpenCommandPalette: () => void;
}

export const TopBar = ({ onOpenCommandPalette }: TopBarProps) => {
    const { currentStoryId, setCurrentStoryId } = useStoryContext();
    const { data: stories } = useStoriesQuery();
    const navigate = useNavigate();
    const { theme } = useTheme();

    const currentStory = stories?.find(s => s.id === currentStoryId);
    const wordmarkSrc = isDarkThemeId(theme) ? "/brand/wordmark-dark.png" : "/brand/wordmark-light.png";
    const isOwner = useIsOwner();

    return (
        <header className="border-b raycast-hairline bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 safe-area-inset-top">
            <div className="flex h-14 items-center px-2 sm:px-4 gap-2 sm:gap-4">
                {/* App Title - hidden on mobile */}
                <div className="hidden sm:flex items-center whitespace-nowrap shrink-0">
                    <img
                        src={wordmarkSrc}
                        alt="Story Labyrinth"
                        className="h-9 w-auto shrink-0 transition-[filter] duration-300 hover:[filter:drop-shadow(0_0_6px_hsl(var(--brand-ember)/0.55))]"
                    />
                </div>

                {/* Story Selector */}
                {currentStory && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="gap-1 sm:gap-2 max-w-[140px] sm:max-w-none">
                                <span className="truncate">{currentStory.title}</span>
                                <span className="text-muted-foreground shrink-0">▾</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                            {stories?.map(story => (
                                <DropdownMenuItem
                                    key={story.id}
                                    onClick={() => setCurrentStoryId(story.id)}
                                    className={story.id === currentStoryId ? "bg-accent" : ""}
                                >
                                    {story.title}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Chapter Switcher */}
                <ChapterSwitcher />

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <TooltipProvider>
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Activity Stoplight - global agentJobs indicator, owner-only (jobs API is owner-gated) */}
                        {isOwner && <ActivityStoplight />}

                        {/* AI Activity - live/streaming AI generation indicator, not owner-gated (any user can generate) */}
                        <AiActivityIndicator
                            entries={useAiActivity()}
                            ariaLabel="AI Activity"
                            heading="AI Activity"
                            emptyLabel="Nothing generating."
                            activeVerb="generating"
                            dotColorClass="bg-sky-500"
                        />

                        {/* AI Actions - one-shot AI POST calls (Humanizer, Lore Sheet, Image Generation, Import) */}
                        <AiActivityIndicator
                            entries={useAiOneShotActivity()}
                            ariaLabel="AI Actions"
                            heading="AI Actions"
                            emptyLabel="No AI actions running."
                            activeVerb="running"
                            dotColorClass="bg-violet-500"
                        />

                        {/* Command Palette - hidden on mobile */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="hidden sm:inline-flex h-9 w-9 raycast-cmdk-trigger"
                                    onClick={onOpenCommandPalette}
                                >
                                    <Search className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Command Palette</p>
                                <p className="text-xs text-primary-foreground/70">
                                    {navigator.platform.toUpperCase().includes("MAC") ? "⌘K" : "Ctrl+K"}
                                </p>
                            </TooltipContent>
                        </Tooltip>

                        {/* Settings/Guide/Theme live in the desktop Sidebar footer instead - these are the
                            mobile equivalents, since mobile has no sidebar (bottom toolbar is nav-only). */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="md:hidden h-9 w-9"
                                    onClick={() => navigate("/settings")}
                                >
                                    <Settings className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Settings</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="hidden sm:inline-flex md:hidden h-9 w-9"
                                    onClick={() => navigate("/guide")}
                                >
                                    <HelpCircle className="h-5 w-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Guide</p>
                            </TooltipContent>
                        </Tooltip>

                        <div className="md:hidden">
                            <ThemeToggle />
                        </div>
                    </div>
                </TooltipProvider>
            </div>
        </header>
    );
};
