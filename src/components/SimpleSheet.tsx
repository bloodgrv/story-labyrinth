import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface SimpleSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    children: ReactNode;
}

// Shared right-side Sheet shape for modal-ish tool panels — Header+Title+optional Description+
// scrollable content+Close footer, same fixed-width sizing Scribble's own Sheet already used
// (ChapterNotesEditor.tsx / LorebookScribbleContent.tsx). Extracted once both EditorToolsPanel.tsx
// (Tags/Outline/POV/Beats/Scanner/History) and ChatToolsRail.tsx (Approvals/Context/Playbook)
// needed the identical shape, replacing their separate bottom-Drawer conventions — user preference
// (2026-08-12) for right-side panels everywhere, superseding T10's originally locked Axis 3 ("modal
// drawers... same class as Editor Scanner/History") now that "same class as Editor" means this.
export function SimpleSheet({ open, onClose, title, description, children }: SimpleSheetProps) {
    return (
        <Sheet open={open} onOpenChange={o => !o && onClose()}>
            <SheetContent side="right" className="h-[100vh] w-full sm:w-[540px] md:w-[700px] lg:w-[800px] sm:max-w-full flex flex-col">
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                    {description && <SheetDescription>{description}</SheetDescription>}
                </SheetHeader>
                <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
                <SheetFooter>
                    <SheetClose asChild>
                        <Button variant="outline">Close</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
