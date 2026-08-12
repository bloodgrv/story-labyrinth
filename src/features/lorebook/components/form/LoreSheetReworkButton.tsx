import { MessageSquarePlus } from "lucide-react";
import type { RefObject } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { captureSheetSelection } from "@/features/rework/adapters/lorebookFieldAdapter";
import { requestRework } from "@/features/rework/pendingReworkStore";

interface LoreSheetReworkButtonProps {
    entryId: string | undefined;
    storyId: string | undefined;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
}

// T9 (Lore Sheet inline rework) — Lore Sheet counterpart to LorebookReworkButton.tsx (the
// description field's own button). Captures a plain <textarea> selectionStart/selectionEnd like
// that one does, but via captureSheetSelection instead of captureDescriptionSelection (adds
// section-boundary resolution/rejection). Disabled until the entry has been saved at least once —
// same reasoning as the description button, anchoring to a WB chat needs a real entryId.
export function LoreSheetReworkButton({ entryId, storyId, textareaRef }: LoreSheetReworkButtonProps) {
    const handleClick = () => {
        if (!entryId || !storyId) {
            toast.error("Save this entry before reworking its Lore Sheet in chat.");
            return;
        }
        const textarea = textareaRef.current;
        if (!textarea) return;

        const captured = captureSheetSelection(entryId, textarea);
        if (captured === "empty") {
            toast.error("No text selected");
            return;
        }
        if (captured === "cross-section") {
            toast.error("Select text within a single section — this selection crosses a heading boundary.");
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
