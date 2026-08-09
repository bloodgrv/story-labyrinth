import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type Control, useWatch } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { codexPendingKeys } from "@/features/lorebook/hooks/useCodexHistoryQuery";
import { lorebookApi } from "@/services/api/client";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";

interface SheetSyncButtonProps {
    control: Control<CreateEntryForm>;
    category: LorebookCategory;
    entryId?: string;
}

// "Sync structured fields" (T5 FS3, docs/Lore_Sheet_And_Sync_Design.md §5/§6) — hybrid
// deterministic + LLM parse of the current Lore Sheet into a codexPendingChanges proposal,
// reviewed via the existing tray (CodexPendingChangesPanel.tsx, rendered right below this in
// LorebookEntryEditor.tsx) — never applies directly (6b's "always propose → Accept" lock).
// Requires a saved entryId (the sheet must belong to a real entry to attach a proposal to and to
// merge against its current Codex state) — disabled with an explanatory tooltip until then.
export function SheetSyncButton({ control, category, entryId }: SheetSyncButtonProps) {
    const sheetBody = useWatch({ control, name: "sheetBody" }) ?? "";
    const queryClient = useQueryClient();

    const syncMutation = useMutation({
        mutationFn: () => lorebookApi.syncSheet(entryId ?? "", { sheetBody, category }),
        onSuccess: result => {
            if (result.success) {
                if (entryId) void queryClient.invalidateQueries({ queryKey: codexPendingKeys.list(entryId) });
                toast.success("Sync proposed — review it below.");
            } else {
                toast.error(result.message || "Nothing to sync");
            }
        },
        onError: (error: Error) => toast.error(error.message || "Couldn't sync the sheet")
    });

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!entryId || !sheetBody.trim() || syncMutation.isPending}
            title={entryId ? undefined : "Save the entry first"}
            onClick={() => syncMutation.mutate()}
        >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {syncMutation.isPending ? "Syncing..." : "Sync structured fields"}
        </Button>
    );
}
