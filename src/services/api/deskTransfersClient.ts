import type { DeskTransfer, DeskTransferEvent, DeskTransferKind } from "@/types/deskTransfer";
import { fetchJSON } from "./apiFactory";

export type LogTransferInput = {
    event: DeskTransferEvent;
    kind: DeskTransferKind;
    fromDesk: string;
    fromChatId?: string | null;
    fromChatTitleSnapshot?: string | null;
    toDesk: string;
    toChatId?: string | null;
    toChatTitleSnapshot?: string | null;
    subject: string;
    crumb?: string | null;
    sourceChecklistItemId?: string | null;
};

export const deskTransfersApi = {
    list: (storyId: string, opts?: { all?: boolean }) =>
        fetchJSON<{ transfers: DeskTransfer[] }>(`/stories/${storyId}/transfers${opts?.all ? "?all=true" : ""}`),
    // Every call site fires this without awaiting — a transfer-log write failing must never
    // block the real seed dispatch it's describing. Callers append `.catch(() => {})`.
    log: (storyId: string, data: LogTransferInput) =>
        fetchJSON<DeskTransfer>(`/stories/${storyId}/transfers`, { method: "POST", body: JSON.stringify(data) })
};
