import { useMutation } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { type Control, useWatch } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { lorebookApi } from "@/services/api/client";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";

interface ExtractPinsButtonProps {
    control: Control<CreateEntryForm>;
    category: LorebookCategory;
    entryId?: string;
}

// "Extract pins" (2026-08-14 follow-up to T6/T5) — dedicated action for timeline/event entries
// whose Lore Sheet describes several distinct beats (e.g. a "Day 1: ... Day 8: ..." multi-day
// Summary), which Sync's own one-pin-per-entry cross-desk lane can't turn into more than one
// truncated pin. Every result lands in Timeline's existing Pending tab for review — never applied
// directly, same doctrine as every other propose/accept surface in this app.
export function ExtractPinsButton({ control, category, entryId }: ExtractPinsButtonProps) {
    const sheetBody = useWatch({ control, name: "sheetBody" }) ?? "";
    const { setCurrentTool } = useStoryContext();

    if (category !== "timeline" && category !== "event") return null;

    const extractMutation = useMutation({
        mutationFn: () => lorebookApi.extractTimelinePins(entryId ?? "", { sheetBody, category }),
        onSuccess: result => {
            if (!result.success) {
                toast.error(result.message || "Couldn't extract pins");
                return;
            }
            if (!result.proposedCount) {
                toast.info(result.message || "No new beats found to propose.");
                return;
            }
            toast.success(
                `${result.proposedCount} pin${result.proposedCount === 1 ? "" : "s"} proposed — review in Timeline → Pending.`,
                { onClick: () => setCurrentTool("story-timeline") }
            );
        },
        onError: (error: Error) => toast.error(error.message || "Couldn't extract pins")
    });

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!entryId || !sheetBody.trim() || extractMutation.isPending}
            title={entryId ? "Break this entry's Lore Sheet into individual pending timeline pins" : "Save the entry first"}
            onClick={() => extractMutation.mutate()}
        >
            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
            {extractMutation.isPending ? "Extracting..." : "Extract pins"}
        </Button>
    );
}
