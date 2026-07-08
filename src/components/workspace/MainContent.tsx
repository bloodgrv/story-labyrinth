import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { BrainstormTool } from "./tools/BrainstormTool";
import { ChaptersTool } from "./tools/ChaptersTool";
import { EditorTool } from "./tools/EditorTool";
import { LorebookTool } from "./tools/LorebookTool";
import { NotesTool } from "./tools/NotesTool";
import { OutlineTool } from "./tools/OutlineTool";
import { PromptsTool } from "./tools/PromptsTool";
import { SeriesTool } from "./tools/SeriesTool";
import { ResearchTool } from "./tools/ResearchTool";
import { StoriesTool } from "./tools/StoriesTool";
import { UsersTool } from "./tools/UsersTool";
import { WorldBuildingTool } from "./tools/WorldBuildingTool";

// Subtle background tints for each tool
const toolTints = {
    stories: "bg-background",
    series: "bg-background",
    editor: "bg-amber-50/10 dark:bg-amber-950/5",
    chapters: "bg-blue-50/10 dark:bg-blue-950/5",
    outline: "bg-rose-50/10 dark:bg-rose-950/5",
    lorebook: "bg-cyan-50/10 dark:bg-cyan-950/5",
    brainstorm: "bg-purple-50/10 dark:bg-purple-950/5",
    prompts: "bg-orange-50/10 dark:bg-orange-950/5",
    notes: "bg-green-50/10 dark:bg-green-950/5",
    users: "bg-background",
    worldbuilding: "bg-violet-50/10 dark:bg-violet-950/5",
    research: "bg-sky-50/10 dark:bg-sky-950/5"
};

export const MainContent = () => {
    const { currentTool } = useStoryContext();

    const renderTool = () => {
        switch (currentTool) {
            case "stories":
                return <StoriesTool />;
            case "series":
                return <SeriesTool />;
            case "editor":
                return <EditorTool />;
            case "chapters":
                return <ChaptersTool />;
            case "outline":
                return <OutlineTool />;
            case "lorebook":
                return <LorebookTool />;
            case "brainstorm":
                return <BrainstormTool />;
            case "prompts":
                return <PromptsTool />;
            case "notes":
                return <NotesTool />;
            case "users":
                return <UsersTool />;
            case "worldbuilding":
                return <WorldBuildingTool />;
            case "research":
                return <ResearchTool />;
            default:
                return (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground">Unknown tool: {currentTool}</p>
                    </div>
                );
        }
    };

    // Every other tool grows to fit its content and lets `main` page-scroll — the right call for
    // list/form-heavy tools. The editor is the exception: its own CSS (.editor-scroller) already
    // scrolls chapter text internally, but that only works if this wrapper has a real bounded
    // height instead of growing to match the content — which split panes need to size against.
    return (
        <div
            className={cn(
                "transition-colors duration-300",
                currentTool === "editor" ? "h-full overflow-hidden" : "min-h-full",
                toolTints[currentTool]
            )}
        >
            {renderTool()}
        </div>
    );
};
