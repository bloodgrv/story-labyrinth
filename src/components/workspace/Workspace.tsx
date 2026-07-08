import { useState } from "react";
import { WellbeingNotices } from "@/features/focus-session/components/WellbeingNotices";
import { FocusSessionProvider, useFocusSession } from "@/features/focus-session/context/FocusSessionContext";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { CommandPalette } from "./CommandPalette";
import { MainContent } from "./MainContent";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { useWorkspaceDeepLink } from "./hooks/useWorkspaceDeepLink";
import { useWorkspaceShortcuts } from "./hooks/useWorkspaceShortcuts";

const WorkspaceContent = () => {
    const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const { currentTool } = useStoryContext();
    const { isActive: sessionActive } = useFocusSession();

    useWorkspaceDeepLink();
    useWorkspaceShortcuts({
        onOpenCommandPalette: () => setCommandPaletteOpen(true)
    });

    // A Deep Writing Session hides the workspace's own chrome (left tool sidebar, top bar) —
    // only while actually on the Editor tool, so switching away (e.g. to check Lorebook) doesn't
    // strand the user in a chrome-less view of an unrelated tool. The session itself keeps
    // running in the background regardless; only the chrome-hiding is tool-scoped.
    const hideChrome = sessionActive && currentTool === "editor";

    return (
        <div className="h-screen flex bg-background">
            {!hideChrome && <Sidebar />}
            <div className="flex-1 flex flex-col min-w-0">
                {!hideChrome && <TopBar onOpenCommandPalette={() => setCommandPaletteOpen(true)} />}
                <main className={hideChrome ? "flex-1 overflow-auto" : "flex-1 overflow-auto pb-16 md:pb-0"}>
                    <MainContent />
                </main>
            </div>
            <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
            <WellbeingNotices />
        </div>
    );
};

export const Workspace = () => (
    <WorkspaceProvider>
        <FocusSessionProvider>
            <WorkspaceContent />
        </FocusSessionProvider>
    </WorkspaceProvider>
);
