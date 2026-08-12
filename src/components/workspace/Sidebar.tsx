import {
    BookOpen,
    Brain,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    FileEdit,
    HelpCircle,
    Layers,
    Library,
    List,
    ListTree,
    Map,
    MessageSquare,
    Network,
    Search,
    Server,
    Settings,
    Sparkles,
    StickyNote
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { useStoryContext, type WorkspaceTool } from "@/features/stories/context/StoryContext";
import { isDarkThemeId, useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
import { version } from "../../../package.json";
import { useWorkspace } from "./context/WorkspaceContext";

const tools = [
    // dividerAfter groups the rail visually: story-selection, then writing/story-scoped desks,
    // then reference/utility tools — purely cosmetic, doesn't affect routing or requiresStory.
    { id: "stories" as WorkspaceTool, label: "Stories", icon: Library, requiresStory: false },
    { id: "series" as WorkspaceTool, label: "Series", icon: Layers, requiresStory: false, dividerAfter: true },
    { id: "editor" as WorkspaceTool, label: "Editor", icon: FileEdit, requiresStory: true },
    { id: "chapters" as WorkspaceTool, label: "Chapters", icon: List, requiresStory: true },
    { id: "outline" as WorkspaceTool, label: "Outline", icon: ListTree, requiresStory: true },
    { id: "lorebook" as WorkspaceTool, label: "Lorebook", icon: BookOpen, requiresStory: true },
    { id: "brainstorm" as WorkspaceTool, label: "Brainstorm", icon: MessageSquare, requiresStory: true },
    { id: "research" as WorkspaceTool, label: "Research", icon: Search, requiresStory: false },
    { id: "notes" as WorkspaceTool, label: "Notes", icon: StickyNote, requiresStory: true, dividerAfter: true },
    { id: "name-generator" as WorkspaceTool, label: "Names", icon: Sparkles, requiresStory: true },
    { id: "memory" as WorkspaceTool, label: "Memory", icon: Brain, requiresStory: true },
    { id: "relationships" as WorkspaceTool, label: "Relations", icon: Network, requiresStory: true },
    // Maps v2 (MV1, docs/Maps_V2_Sketch_Design.md) — same "story-map" id as the old L3 spatial
    // graph tool (decision #4 / implementation clarification d: keep the id, swap the component
    // and label only, to avoid nav-reference churn). See MainContent.tsx's switch case.
    { id: "story-map" as WorkspaceTool, label: "Maps", icon: Map, requiresStory: true },
    // Story Timeline (T6, TL1, docs/Story_Timeline_Design.md) — peer of Maps (design's own "UI
    // surfaces" table), same requiresStory posture.
    { id: "story-timeline" as WorkspaceTool, label: "Timeline", icon: Clock, requiresStory: true }
    // "playbooks" deliberately not in the main rail — it's occasional pack-management config, not
    // a desk you visit repeatedly, and its story-scope distinction from Settings' Writing Tools tab
    // confused users without guidance. Reachable via Settings > Writing tools (now story-aware) and
    // the WB Character chat's "Open Playbooks" link (LorebookEntryEditor.tsx). The tool/route itself
    // stays valid — only removed from this nav list.
];

// Tools that make sense as a standalone browser tab (deep-linkable via /?story=&tool=,
// see useWorkspaceDeepLink.ts) — offered in the "Open in new tab" picker below.
const NEW_TAB_ELIGIBLE_TOOLS: readonly WorkspaceTool[] = ["editor", "lorebook", "chapters", "outline", "notes", "research"];

export const Sidebar = () => {
    const { currentTool, setCurrentTool, currentStoryId } = useStoryContext();
    const { leftSidebar, toggleLeftSidebar } = useWorkspace();
    const { theme } = useTheme();
    const collapsed = leftSidebar.collapsed;
    const monogramSrc = isDarkThemeId(theme) ? "/brand/sl-monogram.png" : "/brand/sl-monogram-light.png";
    const visibleTools = tools;
    const navigate = useNavigate();
    const [newTabSelectMode, setNewTabSelectMode] = useState(false);
    const [selectedForNewTab, setSelectedForNewTab] = useState<Set<WorkspaceTool>>(new Set());

    // Server status page (/_status) lives on the Express backend, not the Vite dev server this
    // client is served from — in dev they're different ports (5173 vs 3001, matching vite.config.ts's
    // own proxy target), so a plain relative link would 404 against Vite instead. In production the
    // backend serves the client too, so the relative path is correct there.
    const openServerStatus = () => {
        const url = import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:3001/_status` : "/_status";
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleToolClick = (toolId: WorkspaceTool, requiresStory: boolean) => {
        if (requiresStory && !currentStoryId) return;
        setCurrentTool(toolId);
    };

    const toggleSelectedForNewTab = (toolId: WorkspaceTool) => {
        setSelectedForNewTab(prev => {
            const next = new Set(prev);
            if (next.has(toolId)) next.delete(toolId);
            else next.add(toolId);
            return next;
        });
    };

    const openSelectedInNewTabs = () => {
        if (!currentStoryId) return;
        let blockedCount = 0;
        for (const toolId of selectedForNewTab) {
            const opened = window.open(`/?story=${currentStoryId}&tool=${toolId}`, "_blank", "noopener,noreferrer");
            if (!opened) blockedCount += 1;
        }
        if (blockedCount > 0) {
            toast.warn(
                `${blockedCount} tab${blockedCount > 1 ? "s were" : " was"} blocked by the browser's popup blocker. Allow popups for this site to open them all at once.`
            );
        }
        setSelectedForNewTab(new Set());
        setNewTabSelectMode(false);
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside
                className={cn(
                    "hidden md:flex flex-col border-r bg-muted/30 transition-all duration-200",
                    collapsed ? "w-12" : "w-[136px]"
                )}
            >
                <div className="flex justify-center pt-3 pb-1">
                    <img
                        src={monogramSrc}
                        alt="Story Labyrinth"
                        className={cn("w-auto", collapsed ? "h-7" : "h-10")}
                    />
                </div>

                <nav className="flex-1 p-2 space-y-1">
                    {visibleTools.map(tool => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;
                        const isDisabled = tool.requiresStory && !currentStoryId;
                        const showCheckbox = newTabSelectMode && !collapsed && NEW_TAB_ELIGIBLE_TOOLS.includes(tool.id);
                        const isSelectedForNewTab = selectedForNewTab.has(tool.id);

                        return (
                            <div key={tool.id}>
                                <div className="flex items-center gap-1">
                                    {showCheckbox && (
                                        <button
                                            type="button"
                                            className={cn(
                                                "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                                                isSelectedForNewTab
                                                    ? "bg-primary border-primary text-primary-foreground"
                                                    : "border-muted-foreground/40"
                                            )}
                                            onClick={() => toggleSelectedForNewTab(tool.id)}
                                            title={`Include ${tool.label} in new tab`}
                                        >
                                            {isSelectedForNewTab && <Check className="h-3 w-3" />}
                                        </button>
                                    )}
                                    <Button
                                        variant={isActive ? "secondary" : "ghost"}
                                        className={cn(
                                            "w-full gap-2",
                                            collapsed ? "justify-center px-0" : "justify-start",
                                            isDisabled && "opacity-50 cursor-not-allowed",
                                            isActive && "raycast-rail-active"
                                        )}
                                        onClick={() =>
                                            showCheckbox
                                                ? toggleSelectedForNewTab(tool.id)
                                                : handleToolClick(tool.id, tool.requiresStory)
                                        }
                                        disabled={isDisabled}
                                        title={collapsed ? tool.label : undefined}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        {!collapsed && <span className="text-sm">{tool.label}</span>}
                                    </Button>
                                </div>
                                {tool.dividerAfter && <Separator className="my-1" />}
                            </div>
                        );
                    })}
                </nav>

                {/* Settings - moved here from the top bar on desktop; mobile still gets it in TopBar
                    since the mobile bottom toolbar (below) is nav-only. Guide/Users/Scanner now live
                    inside Settings itself. New-tab picker controls sit right above it. */}
                <div className="p-2 border-t space-y-1">
                    {!collapsed && currentStoryId && (
                        <>
                            {newTabSelectMode ? (
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        className="flex-1 gap-1 px-1"
                                        disabled={selectedForNewTab.size === 0}
                                        onClick={openSelectedInNewTabs}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                        Open
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="px-2"
                                        onClick={() => {
                                            setNewTabSelectMode(false);
                                            setSelectedForNewTab(new Set());
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full gap-2 justify-start px-2"
                                    onClick={() => setNewTabSelectMode(true)}
                                >
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-sm">New tab</span>
                                </Button>
                            )}
                        </>
                    )}
                    <Button
                        variant="ghost"
                        className={cn("w-full gap-2", collapsed ? "justify-center px-0" : "justify-start")}
                        onClick={() => navigate("/settings")}
                        title={collapsed ? "Settings" : undefined}
                    >
                        <Settings className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">Settings</span>}
                    </Button>
                    <Button
                        variant="ghost"
                        className={cn("w-full gap-2", collapsed ? "justify-center px-0" : "justify-start")}
                        onClick={() => navigate("/guide")}
                        title={collapsed ? "Guide" : undefined}
                    >
                        <HelpCircle className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">Guide</span>}
                    </Button>
                </div>

                <div className="p-2 border-t space-y-2">
                    <div className="text-xs text-muted-foreground text-center">
                        {collapsed ? `v${version}` : `Version ${version}`}
                    </div>
                    <Button
                        variant="ghost"
                        size={collapsed ? "icon" : "default"}
                        className={collapsed ? "w-full" : "w-full justify-start gap-2"}
                        onClick={openServerStatus}
                        title="Server status"
                    >
                        <Server className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">Server</span>}
                    </Button>
                    <LogoutButton collapsed={collapsed} className="w-full" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-full"
                        onClick={toggleLeftSidebar}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </Button>
                </div>
            </aside>

            {/* Mobile Bottom Toolbar */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-50">
                <div className="flex justify-around p-1 sm:p-2">
                    {visibleTools.map(tool => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;
                        const isDisabled = tool.requiresStory && !currentStoryId;

                        return (
                            <Button
                                key={tool.id}
                                variant={isActive ? "secondary" : "ghost"}
                                size="sm"
                                className={cn(
                                    "flex-col h-auto py-1.5 px-1 sm:px-2 gap-0.5 min-w-0",
                                    isDisabled && "opacity-50 cursor-not-allowed"
                                )}
                                onClick={() => handleToolClick(tool.id, tool.requiresStory)}
                                disabled={isDisabled}
                            >
                                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                                <span className="text-[10px] sm:text-xs truncate max-w-[40px] sm:max-w-none">
                                    {tool.label}
                                </span>
                            </Button>
                        );
                    })}
                </div>
            </nav>
        </>
    );
};
