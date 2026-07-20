import { MessageSquarePlus } from "lucide-react";
import type { JSX } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useEditorChapterId, useEditorStoryId } from "@/features/editor-multiview/context/EditorPaneContext";
import { requestRework } from "@/features/rework/pendingReworkStore";
import { buildChapterFocusWindow, captureFocusTarget } from "@/features/rework/adapters/chapterSelectionAdapter";
import type { LexicalEditor } from "lexical";

interface ReworkButtonProps {
    editor: LexicalEditor;
    label?: string;
    initialInstruction?: string;
}

// Captures the live selection and hands it to the Editor chat rail (a sibling panel, outside
// this composer tree) via pendingReworkStore, instead of generating/inserting text directly —
// the new primary path for AI-assisted selection edits (docs/Chat_Panel_Integrations_Design.md
// §2.1). Also reused by the Expand/Rewrite/Shorten chips (see GenerateButtons.tsx), each passing
// their own initialInstruction.
export function ReworkButton({ editor, label = "Rework in chat", initialInstruction }: ReworkButtonProps): JSX.Element {
    const chapterId = useEditorChapterId();
    const storyId = useEditorStoryId();

    const handleClick = () => {
        if (!chapterId || !storyId) {
            toast.error("Open a chapter before reworking a selection.");
            return;
        }
        const target = captureFocusTarget(editor, chapterId);
        const packet = buildChapterFocusWindow(editor);
        if (!target || !packet) {
            toast.error("No text selected");
            return;
        }
        requestRework({ chapterId, storyId, target, packet, initialInstruction });
    };

    return (
        <Button variant="outline" size="sm" onClick={handleClick} className="flex items-center gap-1">
            <MessageSquarePlus className="h-3 w-3" />
            <span>{label}</span>
        </Button>
    );
}
