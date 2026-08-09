import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type Control, useWatch } from "react-hook-form";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { codexPendingKeys } from "@/features/lorebook/hooks/useCodexHistoryQuery";
import { lorebookApi } from "@/services/api/client";
import type { SyncSheetResult } from "@/services/api/lorebookClient";
import type { CreateEntryForm, LorebookCategory } from "./entryFormUtils";

interface SheetSyncButtonProps {
    control: Control<CreateEntryForm>;
    category: LorebookCategory;
    entryId?: string;
    // T5 FS5 — hands the raw result up to LorebookEntryEditor.tsx so it can render
    // SheetSyncCrossDeskCard for whichever of the map/timeline/notes lanes fired. This button stays
    // focused on the Codex-tray lane (toast + query invalidation); the cross-desk lanes are a
    // sibling concern with their own accept UI, not something this button renders itself.
    onSynced?: (result: SyncSheetResult) => void;
}

// "Sync structured fields" (T5 FS3, docs/Lore_Sheet_And_Sync_Design.md §5/§6) — hybrid
// deterministic + LLM parse of the current Lore Sheet into a codexPendingChanges proposal,
// reviewed via the existing tray (CodexPendingChangesPanel.tsx, rendered right below this in
// LorebookEntryEditor.tsx) — never applies directly (6b's "always propose → Accept" lock).
// Requires a saved entryId (the sheet must belong to a real entry to attach a proposal to and to
// merge against its current Codex state) — disabled with an explanatory tooltip until then.
export function SheetSyncButton({ control, category, entryId, onSynced }: SheetSyncButtonProps) {
    const sheetBody = useWatch({ control, name: "sheetBody" }) ?? "";
    const queryClient = useQueryClient();

    const syncMutation = useMutation({
        mutationFn: () => lorebookApi.syncSheet(entryId ?? "", { sheetBody, category }),
        onSuccess: result => {
            if (result.success) {
                if (entryId && result.pendingChangeId) void queryClient.invalidateQueries({ queryKey: codexPendingKeys.list(entryId) });
                if (result.pendingChangeId) toast.success("Sync proposed — review it below.");
                if (result.timelinePinId) toast.success("Timeline pin proposed — review it in Timeline → Pending.");
                if (result.crossDeskNotice) toast.info(result.crossDeskNotice);
                onSynced?.(result);
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
