import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    ListChecks,
    type LucideIcon,
    Menu,
    ScanSearch,
    StickyNote,
    Tags,
    User
} from "lucide-react";
import { DownloadMenu } from "@/components/ui/DownloadMenu";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle
} from "@/components/ui/drawer";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChapterNotesEditor } from "@/features/chapters/components/ChapterNotesEditor";
import { ChapterOutline } from "@/features/chapters/components/ChapterOutline";
import { ChapterPOVEditor } from "@/features/chapters/components/ChapterPOVEditor";
import { ConcreteBeatsPanel } from "@/features/chapters/components/ConcreteBeatsPanel";
import { MatchedTagEntries } from "@/features/chapters/components/MatchedTagEntries";
import { ChapterScannerDrawer } from "@/features/rag-scanner/components/ChapterScannerDrawer";
import { cn } from "@/lib/utils";
import type { Chapter } from "@/types/story";

export type DrawerType =
    | "matchedTags"
    | "chapterOutline"
    | "chapterPOV"
    | "chapterNotes"
    | "chapterBeats"
    | "ragScanner"
    | null;

export const sidebarButtons: { id: DrawerType; icon: LucideIcon; label: string; title: string }[] = [
    { id: "matchedTags", icon: Tags, label: "Tags", title: "Matched Tags" },
    { id: "chapterOutline", icon: BookOpen, label: "Outline", title: "Chapter Outline" },
    { id: "chapterPOV", icon: User, label: "POV", title: "Edit POV" },
    { id: "chapterNotes", icon: StickyNote, label: "Notes", title: "Chapter Notes" },
    { id: "chapterBeats", icon: ListChecks, label: "Beats", title: "Concrete Beats" },
    { id: "ragScanner", icon: ScanSearch, label: "Scanner", title: "RAG Scanner" }
];

// Every drawer below ends with the same "Close" footer — factored out once so adding a new
// drawer doesn't also mean repeating this boilerplate.
function DrawerCloseFooter() {
    return (
        <DrawerFooter>
            <DrawerClose asChild>
                <Button variant="outline">Close</Button>
            </DrawerClose>
        </DrawerFooter>
    );
}

interface EditorToolsPanelProps {
    openDrawer: DrawerType;
    onToggleDrawer: (drawer: DrawerType) => void;
    onCloseDrawer: () => void;
    currentChapterId: string | null;
    currentStoryId: string | null;
    currentChapter: Chapter | undefined;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

// The right-rail tool sidebar (Tags/Outline/POV/Notes/Beats) plus its drawers/sheet, and the
// mobile floating-menu equivalent — extracted out of StoryEditor.tsx purely to keep that file
// under the project's max-lines lint limit once Deep Writing Sessions added HUD/theme wiring
// there. Rendered only when no focus session is active (StoryEditor hides this whole panel
// during a session) — kept as a plain, always-mountable component rather than baking that
// condition in here, so the caller stays in control of when it shows.
export function EditorToolsPanel({
    openDrawer,
    onToggleDrawer,
    onCloseDrawer,
    currentChapterId,
    currentStoryId,
    currentChapter,
    collapsed,
    onToggleCollapsed
}: EditorToolsPanelProps) {
    return (
        <>
            {/* Mobile floating menu for editor tools */}
            <div className="md:hidden fixed bottom-20 right-4 z-40">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon" className="h-12 w-12 rounded-full shadow-lg">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="mb-2">
                        {sidebarButtons.map(({ id, icon: Icon, title }) => (
                            <DropdownMenuItem key={id} onClick={() => onToggleDrawer(id)}>
                                <Icon className="h-4 w-4 mr-2" />
                                {title}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <aside
                className={cn(
                    "hidden md:flex flex-col border-l bg-muted/20 transition-all duration-200",
                    collapsed ? "w-12" : "w-36"
                )}
            >
                <div className="flex-1 py-2 space-y-2">
                    {sidebarButtons.map(({ id, icon: Icon, label, title }) => (
                        <Button
                            key={id}
                            variant={openDrawer === id ? "default" : "outline"}
                            size="sm"
                            className={cn("mx-2", collapsed ? "justify-center px-0 w-8" : "justify-start")}
                            onClick={() => onToggleDrawer(id)}
                            title={title}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span className="ml-2">{label}</span>}
                        </Button>
                    ))}

                    {currentChapterId && !collapsed && (
                        <DownloadMenu
                            type="chapter"
                            id={currentChapterId}
                            variant="outline"
                            size="sm"
                            showIcon={true}
                            label="Download"
                            className="mx-2 justify-start"
                        />
                    )}
                </div>

                <div className="p-2 border-t">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-full"
                        onClick={onToggleCollapsed}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                </div>
            </aside>

            {/* Matched Tags Drawer */}
            <Drawer open={openDrawer === "matchedTags"} onOpenChange={open => !open && onCloseDrawer()}>
                <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                        <DrawerTitle>Matched Tag Entries</DrawerTitle>
                        <DrawerDescription>Lorebook entries that match tags in your current chapter.</DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto max-h-[60vh]">
                        <MatchedTagEntries />
                    </div>
                    <DrawerCloseFooter />
                </DrawerContent>
            </Drawer>

            {/* Chapter Outline Drawer */}
            <Drawer open={openDrawer === "chapterOutline"} onOpenChange={open => !open && onCloseDrawer()}>
                <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                        <DrawerTitle>Chapter Outline</DrawerTitle>
                        <DrawerDescription>Outline and notes for your current chapter.</DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto max-h-[60vh]">
                        {currentChapter && <ChapterOutline key={currentChapter.id} chapter={currentChapter} />}
                    </div>
                    <DrawerCloseFooter />
                </DrawerContent>
            </Drawer>

            {/* Concrete Beats Drawer */}
            <Drawer open={openDrawer === "chapterBeats"} onOpenChange={open => !open && onCloseDrawer()}>
                <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                        <DrawerTitle>Concrete Beats</DrawerTitle>
                        <DrawerDescription>
                            Physical actions, wardrobe/item changes, and other concrete beats marked in this chapter.
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto max-h-[60vh]">
                        {currentChapterId && currentStoryId && (
                            <ConcreteBeatsPanel chapterId={currentChapterId} storyId={currentStoryId} />
                        )}
                    </div>
                    <DrawerCloseFooter />
                </DrawerContent>
            </Drawer>

            {/* RAG Scanner Drawer */}
            <Drawer open={openDrawer === "ragScanner"} onOpenChange={open => !open && onCloseDrawer()}>
                <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                        <DrawerTitle>RAG Scanner</DrawerTitle>
                        <DrawerDescription>
                            Scan this chapter against the Codex and prior chapters for contradictions and state
                            mismatches.
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto max-h-[60vh]">
                        {currentChapterId && currentStoryId && (
                            <ChapterScannerDrawer chapterId={currentChapterId} storyId={currentStoryId} />
                        )}
                    </div>
                    <DrawerCloseFooter />
                </DrawerContent>
            </Drawer>

            {/* Chapter POV Drawer */}
            <Drawer open={openDrawer === "chapterPOV"} onOpenChange={open => !open && onCloseDrawer()}>
                <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                        <DrawerTitle>Edit Chapter POV</DrawerTitle>
                        <DrawerDescription>
                            Change the point of view character and perspective for this chapter.
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto max-h-[60vh]">
                        {currentChapter && <ChapterPOVEditor chapter={currentChapter} onClose={onCloseDrawer} />}
                    </div>
                    <DrawerCloseFooter />
                </DrawerContent>
            </Drawer>

            {/* Replace the Chapter Notes Drawer with this Sheet */}
            <Sheet open={openDrawer === "chapterNotes"} onOpenChange={open => !open && onCloseDrawer()}>
                <SheetContent
                    side="right"
                    className="h-[100vh] w-full sm:w-[540px] md:w-[700px] lg:w-[800px] sm:max-w-full"
                >
                    <SheetHeader>
                        <SheetTitle>Scribble</SheetTitle>
                    </SheetHeader>
                    <div className="overflow-y-auto h-[100vh]">
                        {currentChapter && (
                            <ChapterNotesEditor
                                key={currentChapter.id}
                                chapter={currentChapter}
                                onClose={onCloseDrawer}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
