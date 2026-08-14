import { Clock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePinForLinkQuery, useCreatePinMutation, useUpdatePinMutation } from "@/features/story-timeline/hooks/useStoryTimelineQuery";
import type { PinLinkType, PinManuscriptStatus, PinWhenKind } from "@/types/storyTimeline";
import { PinFormDialog } from "./PinFormDialog";

interface PlaceOnTimelineButtonProps {
    storyId: string;
    linkType: PinLinkType;
    linkId: string;
    defaultTitle: string;
    // Icon-only, for a row-action toolbar (ChapterCard.tsx's Edit/Write/Delete/Expand icon row,
    // NoteListItem.tsx's hover action row) — the labeled variant (default) matches
    // OpenMapButton.tsx's convention for standalone use (lorebook entry editor).
    compact?: boolean;
    // Matches ChapterCard.tsx's h-8/h-4 icon-button scale (default) vs. NoteListItem.tsx's
    // smaller ActionButton "sm" scale (h-6/h-3) — compact-only.
    compactSize?: "default" | "sm";
}

// Story Timeline (T6, TL3) — generic reusable "Place on timeline" affordance for chapters, lorebook
// entries, and notes (design: multi-source pins, "any category" for lorebook). Checks for an
// existing pin on this exact link first so a second click edits rather than duplicates.
export function PlaceOnTimelineButton({ storyId, linkType, linkId, defaultTitle, compact, compactSize = "default" }: PlaceOnTimelineButtonProps) {
    const [open, setOpen] = useState(false);
    const { data: existingPin } = usePinForLinkQuery(storyId, linkType, linkId);
    const createMutation = useCreatePinMutation(storyId);
    const updateMutation = useUpdatePinMutation(storyId);

    const handleSubmit = (values: {
        title: string;
        blurb: string | null;
        whenKind: PinWhenKind;
        relativeOffsetYears: number | null;
        fuzzyPhrase: string | null;
        civilDate: string | null;
        manuscriptStatus: PinManuscriptStatus;
    }) => {
        if (existingPin) updateMutation.mutate({ id: existingPin.id, data: values }, { onSuccess: () => setOpen(false) });
        else createMutation.mutate({ ...values, linkType, linkId }, { onSuccess: () => setOpen(false) });
    };

    const title = existingPin ? "Edit timeline placement" : "Place on timeline";

    return (
        <>
            {compact ? (
                <Button
                    variant="ghost"
                    size="icon"
                    className={compactSize === "sm" ? "h-6 w-6" : "h-8 w-8"}
                    title={title}
                    onClick={() => setOpen(true)}
                >
                    <Clock className={compactSize === "sm" ? "h-3 w-3" : "h-4 w-4"} />
                </Button>
            ) : (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
                    <Clock className="h-3.5 w-3.5" />
                    {title}
                </Button>
            )}
            <PinFormDialog
                open={open}
                onOpenChange={setOpen}
                pin={existingPin ?? null}
                initialTitle={defaultTitle}
                link={{ linkType, linkId }}
                onSubmit={handleSubmit}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
            />
        </>
    );
}
