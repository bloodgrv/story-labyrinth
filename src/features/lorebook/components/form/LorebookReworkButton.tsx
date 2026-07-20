import { MessageSquarePlus } from "lucide-react";
import type { RefObject } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { captureDescriptionSelection } from "@/features/rework/adapters/lorebookFieldAdapter";
import { requestRework } from "@/features/rework/pendingReworkStore";

interface LorebookReworkButtonProps {
    entryId: string | undefined;
    storyId: string | undefined;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
}

// Description-field counterpart to the chapter editor's ReworkButton.tsx — captures a plain
// <Textarea> selection (native selectionStart/selectionEnd) instead of a Lexical range, and hands
// it to the entry's World-Building chat via the same pendingReworkStore bridge
// (docs/Chat_Panel_Integrations_Design.md §3, P0.4 R4). Disabled until the entry has been saved
// at least once — anchoring to a WB chat needs a real entryId.
export function LorebookReworkButton({ entryId, storyId, textareaRef }: LorebookReworkButtonProps) {
    const handleClick = () => {
        if (!entryId || !storyId) {
            toast.error("Save this entry before reworking its description in chat.");
            return;
        }
        const textarea = textareaRef.current;
        if (!textarea) return;

        const captured = captureDescriptionSelection(entryId, textarea);
        if (!captured) {
            toast.error("No text selected");
            return;
        }

        requestRework({ panel: "worldbuilding", anchorId: entryId, storyId, target: captured.target, packet: captured.packet });
    };

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleClick}
            disabled={!entryId || !storyId}
            title={!entryId ? "Save this entry first" : "Rework selected text in chat"}
        >
            <MessageSquarePlus className="h-3 w-3" />
            Rework in chat
        </Button>
    );
}
