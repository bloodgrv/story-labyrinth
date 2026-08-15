import { useStoryContext } from "@/features/stories/context/StoryContext";
import { cn } from "@/lib/utils";
import { AiReviewTool } from "./tools/AiReviewTool";
import { BrainstormTool } from "./tools/BrainstormTool";
import { ChaptersTool } from "./tools/ChaptersTool";
import { EditorTool } from "./tools/EditorTool";
import { LorebookTool } from "./tools/LorebookTool";
import { MapsTool } from "./tools/MapsTool";
import { NameGeneratorTool } from "./tools/NameGeneratorTool";
import { NotesTool } from "./tools/NotesTool";
import { OutlineTool } from "./tools/OutlineTool";
import { PlaybookPacksTool } from "./tools/PlaybookPacksTool";
import { ProjectMemoryTool } from "./tools/ProjectMemoryTool";
import { SeriesTool } from "./tools/SeriesTool";
import { RagScannerTool } from "./tools/RagScannerTool";
import { ResearchTool } from "./tools/ResearchTool";
import { StoriesTool } from "./tools/StoriesTool";
import { StoryGraphTool } from "./tools/StoryGraphTool";
import { TimelineTool } from "./tools/TimelineTool";
import { UsersTool } from "./tools/UsersTool";


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
            case "name-generator":
                return <NameGeneratorTool />;
            case "users":
                return <UsersTool />;
            case "research":
                return <ResearchTool />;
            case "memory":
                return <ProjectMemoryTool />;
            case "relationships":
                return <StoryGraphTool />;
            case "story-map":
                return <MapsTool />;
            case "story-timeline":
                return <TimelineTool />;
            case "scanner":
                return <RagScannerTool />;
            case "ai-review":
                return <AiReviewTool />;
            case "playbooks":
                return <PlaybookPacksTool />;
            default:
                return (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-muted-foreground">Unknown tool: {currentTool}</p>
                    </div>
                );
        }
    };

    // Every other tool grows to fit its content and lets `main` page-scroll — the right call for
    // list/form-heavy tools. Editor, Outline, Lorebook, Notes, Brainstorm, and Research are the
    // exception: Editor/Outline can render a resizable chat rail (react-resizable-panels),
    // Lorebook and Notes (T7) both have their own open-tabs strip + optional docked chat rail
    // (LorebookPage.tsx/NotesTool.tsx), and Brainstorm/Research both dock a persistent
    // chat-history sidebar (ChatList.tsx) next to the message thread — all six need a real
    // bounded height to lay out against instead of a wrapper that grows to match the content.
    // Without this, Brainstorm's own scroll-to-bottom-on-new-message effect had nowhere bounded
    // to scroll within, so it scrolled the page-level `main` itself instead — dragging the chat
    // list sidebar (and its collapse toggle) off-screen along with it every time a message
    // arrived. Research had the identical gap — same ChatList sidebar, same missing entry here —
    // just not noticed until its own collapse toggle was reported "gone entirely" (it wasn't
    // gone, it had scrolled hundreds of pixels above the viewport with the rest of the page).
    // Relationships joins this group for the same reason: React Flow's canvas needs a real
    // bounded viewport to pan/zoom within, not a wrapper that grows to match content. "story-map"
    // (Maps v2) rejoins this group as of MV2 for the same reason — MapDetailPanel.tsx now embeds
    // an Excalidraw canvas, which fills its parent's height rather than growing to match content;
    // MapsListPanel.tsx (the list view, no canvas) manages its own internal scroll region within
    // the bounded shell instead.
    const needsBoundedHeight =
        currentTool === "editor" ||
        currentTool === "outline" ||
        currentTool === "lorebook" ||
        currentTool === "notes" ||
        currentTool === "brainstorm" ||
        currentTool === "research" ||
        currentTool === "relationships" ||
        currentTool === "story-map" ||
        currentTool === "story-timeline";

    return (
        <div
            className={cn("bg-background transition-colors duration-300", needsBoundedHeight ? "h-full overflow-hidden" : "min-h-full")}
        >
            {renderTool()}
        </div>
    );
};
