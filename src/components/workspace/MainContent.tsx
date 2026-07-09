import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { BrainstormTool } from "./tools/BrainstormTool";
import { ChaptersTool } from "./tools/ChaptersTool";
import { EditorTool } from "./tools/EditorTool";
import { LorebookTool } from "./tools/LorebookTool";
import { NotesTool } from "./tools/NotesTool";
import { OutlineTool } from "./tools/OutlineTool";
import { SeriesTool } from "./tools/SeriesTool";
import { ResearchTool } from "./tools/ResearchTool";
import { StoriesTool } from "./tools/StoriesTool";
import { UsersTool } from "./tools/UsersTool";

// Subtle background tints for each tool
const toolTints = {
    stories: "bg-background",
    series: "bg-background",
    editor: "bg-amber-50/10 dark:bg-amber-950/5",
    chapters: "bg-blue-50/10 dark:bg-blue-950/5",
    outline: "bg-rose-50/10 dark:bg-rose-950/5",
    lorebook: "bg-cyan-50/10 dark:bg-cyan-950/5",
    brainstorm: "bg-purple-50/10 dark:bg-purple-950/5",
    notes: "bg-green-50/10 dark:bg-green-950/5",
    users: "bg-background",
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
            case "notes":
                return <NotesTool />;
            case "users":
                return <UsersTool />;
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
    // list/form-heavy tools. Editor and Outline are the exception: both can render a resizable
    // chat rail (react-resizable-panels) alongside their own content, which needs a real bounded
    // height to size against instead of a wrapper that grows to match the content.
    const needsBoundedHeight = currentTool === "editor" || currentTool === "outline";

    return (
        <div
            className={cn(
                "transition-colors duration-300",
                needsBoundedHeight ? "h-full overflow-hidden" : "min-h-full",
                toolTints[currentTool]
            )}
        >
            {renderTool()}
        </div>
    );
};
