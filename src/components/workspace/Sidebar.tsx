import {
    BookOpen,
    Brain,
    ChevronLeft,
    ChevronRight,
    FileEdit,
    HelpCircle,
    Layers,
    Library,
    List,
    ListTree,
    MessageSquare,
    Network,
    ScanSearch,
    Search,
    Settings,
    Sparkles,
    StickyNote,
    Users
} from "lucide-react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useStoryContext, type WorkspaceTool } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { version } from "../../../package.json";
import { useWorkspace } from "./context/WorkspaceContext";

const tools = [
    { id: "stories" as WorkspaceTool, label: "Stories", icon: Library, requiresStory: false },
    { id: "series" as WorkspaceTool, label: "Series", icon: Layers, requiresStory: false },
    { id: "editor" as WorkspaceTool, label: "Editor", icon: FileEdit, requiresStory: true },
    { id: "chapters" as WorkspaceTool, label: "Chapters", icon: List, requiresStory: true },
    { id: "outline" as WorkspaceTool, label: "Outline", icon: ListTree, requiresStory: true },
    { id: "lorebook" as WorkspaceTool, label: "Lorebook", icon: BookOpen, requiresStory: true },
    { id: "brainstorm" as WorkspaceTool, label: "Brainstorm", icon: MessageSquare, requiresStory: true },
    { id: "research" as WorkspaceTool, label: "Research", icon: Search, requiresStory: false },
    { id: "notes" as WorkspaceTool, label: "Notes", icon: StickyNote, requiresStory: true },
    { id: "name-generator" as WorkspaceTool, label: "Names", icon: Sparkles, requiresStory: true },
    { id: "memory" as WorkspaceTool, label: "Memory", icon: Brain, requiresStory: true },
    { id: "relationships" as WorkspaceTool, label: "Relations", icon: Network, requiresStory: true },
    { id: "scanner" as WorkspaceTool, label: "Scanner", icon: ScanSearch, requiresStory: true }
];

const ownerOnlyTools = [{ id: "users" as WorkspaceTool, label: "Users", icon: Users, requiresStory: false }];

export const Sidebar = () => {
    const { currentTool, setCurrentTool, currentStoryId } = useStoryContext();
    const { leftSidebar, toggleLeftSidebar } = useWorkspace();
    const collapsed = leftSidebar.collapsed;
    const isOwner = useIsOwner();
    const visibleTools = isOwner ? [...tools, ...ownerOnlyTools] : tools;
    const navigate = useNavigate();

    const handleToolClick = (toolId: WorkspaceTool, requiresStory: boolean) => {
        if (requiresStory && !currentStoryId) return;
        setCurrentTool(toolId);
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside
                className={cn(
                    "hidden md:flex flex-col border-r bg-muted/30 transition-all duration-200",
                    collapsed ? "w-12" : "w-32"
                )}
            >
                <nav className="flex-1 p-2 space-y-1">
                    {visibleTools.map(tool => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;
                        const isDisabled = tool.requiresStory && !currentStoryId;

                        return (
                            <Button
                                key={tool.id}
                                variant={isActive ? "secondary" : "ghost"}
                                className={cn(
                                    "w-full gap-2",
                                    collapsed ? "justify-center px-0" : "justify-start",
                                    isDisabled && "opacity-50 cursor-not-allowed",
                                    isActive && "raycast-rail-active"
                                )}
                                onClick={() => handleToolClick(tool.id, tool.requiresStory)}
                                disabled={isDisabled}
                                title={collapsed ? tool.label : undefined}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {!collapsed && <span className="text-sm">{tool.label}</span>}
                            </Button>
                        );
                    })}
                </nav>

                {/* Settings/Guide/Theme - moved here from the top bar on desktop; mobile still gets
                    them in TopBar since the mobile bottom toolbar (below) is nav-only. */}
                <div className="p-2 border-t space-y-1">
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
                    <ThemeToggle isExpanded={!collapsed} />
                </div>

                <div className="p-2 border-t space-y-2">
                    <div className="text-xs text-muted-foreground text-center">
                        {collapsed ? `v${version}` : `Version ${version}`}
                    </div>
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
