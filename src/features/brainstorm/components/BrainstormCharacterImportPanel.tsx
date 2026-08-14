import { attemptPromise } from "@jfdi/attempt";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { brainstormApi, lorebookApi } from "@/services/api/client";

interface BrainstormCharacterImportPanelProps {
    chatId: string;
    storyId: string;
}

// Brainstorm's own entry point into the shared multi-subject extraction service (2026-08-14,
// documentImportService.ts's importEntriesFromDocument — same one task 6's Lorebook toolbar
// button calls). Mirrors Outline chat's OI6 file-attach precedent (OutlineChatRail.tsx: hidden
// <input type="file"> + a click-to-attach button, no drag/drop). Unlike Outline Import, this
// doesn't run its own dedicated import job — it just persists the extracted drafts as a durable
// `character_batch` checklist row (same table every other Brainstorm write already uses), so
// review/accept happens in the Approvals tray like everything else here, not a separate surface.
export function BrainstormCharacterImportPanel({ chatId, storyId }: BrainstormCharacterImportPanelProps) {
    const [isExtracting, setIsExtracting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();

    const handleFile = async (file: File) => {
        setIsExtracting(true);
        const [extractError, result] = await attemptPromise(() => lorebookApi.importDocumentBatch(file));
        if (extractError) {
            setIsExtracting(false);
            toast.error(extractError.message || "Failed to import document");
            return;
        }

        const [createError] = await attemptPromise(() =>
            brainstormApi.createChecklistItem({
                chatId,
                storyId,
                kind: "character_batch",
                payload: { filename: file.name, drafts: result.drafts }
            })
        );
        setIsExtracting(false);
        if (createError) {
            toast.error(createError.message || "Failed to save the extracted characters");
            return;
        }

        toast.success(`Found ${result.drafts.length} entr${result.drafts.length === 1 ? "y" : "ies"} — review in Approvals.`);
        void queryClient.invalidateQueries({ queryKey: ["brainstorm-checklist", chatId] });
    };

    return (
        <div className="p-3 space-y-2">
            <p className="text-sm text-muted-foreground">
                Attach a reference document describing several characters or locations — each will be extracted as its
                own entry, reviewed in Approvals before anything is created.
            </p>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.md,.txt"
                className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                }}
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {isExtracting ? "Analyzing..." : "Attach document…"}
            </Button>
        </div>
    );
}
