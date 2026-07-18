import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { Bold, Italic, Redo2, Underline, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Deliberately minimal — not ToolbarPlugin (main editor), which bakes in a focus-session button
// that reports word count against whatever chapter is globally active, wrong for a version tab
// that isn't scoped via EditorPaneContext. Just the formatting essentials for drafting.
export function VersionToolbar() {
    const [editor] = useLexicalComposerContext();

    return (
        <div className="flex items-center gap-1 border-b px-2 py-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Undo" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
                <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Redo" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
                <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Bold"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
            >
                <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Italic"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
            >
                <Italic className="h-3.5 w-3.5" />
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Underline"
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
            >
                <Underline className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
