import type {
    BrainstormChecklistItem,
    BrainstormChecklistPayload,
    BrainstormChecklistStatus,
    BrainstormSlot,
    HandoffPacket,
    OverviewProposalPayload
} from "@/types/brainstorm";
import { fetchJSON } from "./apiFactory";

// See server/services/brainstormExtractService.ts's own comment for why this exists — an
// isolated follow-up extraction pass over an already-generated Brainstorm reply, since the
// reply's own fence-emission during normal conversational generation is unreliable.
export interface BrainstormExtractResult {
    overview: OverviewProposalPayload | null;
    handoffs: HandoffPacket[];
    droppedCount: number;
}

// P0.4 B0-B4 — replaces the old bare chat-CRUD brainstormApi (Brainstorm chats now ride
// chatsApi/chatType="brainstorm" like every other chat type). This client only covers the two
// genuinely new resources: the durable checklist tray (B4) and the setup-slot checklist (B2).
export const brainstormApi = {
    listChecklist: (chatId: string, status: "active" | "done" = "active") =>
        fetchJSON<{ items: BrainstormChecklistItem[] }>(`/brainstorm/checklist?${new URLSearchParams({ chatId, status })}`),
    createChecklistItem: (data: {
        chatId: string;
        storyId: string;
        kind: "overview_proposal" | "handoff" | "note_split" | "shuttle" | "shuttle_return" | "character_batch";
        payload: BrainstormChecklistPayload;
        sourceMessageId?: string | null;
    }) => fetchJSON<BrainstormChecklistItem>("/brainstorm/checklist", { method: "POST", body: JSON.stringify(data) }),
    updateChecklistStatus: (id: string, status: BrainstormChecklistStatus) =>
        fetchJSON<BrainstormChecklistItem>(`/brainstorm/checklist/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    getSlots: (storyId: string) => fetchJSON<{ slots: BrainstormSlot[] }>(`/brainstorm/slots?${new URLSearchParams({ storyId })}`),
    setSlotStatus: (storyId: string, slotKey: string, status: "known" | "unknown") =>
        fetchJSON<BrainstormSlot>(`/brainstorm/slots/${slotKey}`, { method: "PATCH", body: JSON.stringify({ storyId, status }) }),
    extractProposals: (replyText: string, userMessageText?: string) =>
        fetchJSON<BrainstormExtractResult>("/brainstorm/extract-proposals", {
            method: "POST",
            body: JSON.stringify({ replyText, userMessageText })
        })
};
