import type { BrainstormChecklistItem, BrainstormChecklistPayload, BrainstormChecklistStatus, BrainstormSlot } from "@/types/brainstorm";
import { fetchJSON } from "./apiFactory";

// P0.4 B0-B4 — replaces the old bare chat-CRUD brainstormApi (Brainstorm chats now ride
// chatsApi/chatType="brainstorm" like every other chat type). This client only covers the two
// genuinely new resources: the durable checklist tray (B4) and the setup-slot checklist (B2).
export const brainstormApi = {
    listChecklist: (chatId: string, status: "active" | "done" = "active") =>
        fetchJSON<{ items: BrainstormChecklistItem[] }>(`/brainstorm/checklist?${new URLSearchParams({ chatId, status })}`),
    createChecklistItem: (data: {
        chatId: string;
        storyId: string;
        kind: "overview_proposal" | "handoff" | "note_split";
        payload: BrainstormChecklistPayload;
        sourceMessageId?: string | null;
    }) => fetchJSON<BrainstormChecklistItem>("/brainstorm/checklist", { method: "POST", body: JSON.stringify(data) }),
    updateChecklistStatus: (id: string, status: BrainstormChecklistStatus) =>
        fetchJSON<BrainstormChecklistItem>(`/brainstorm/checklist/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    getSlots: (storyId: string) => fetchJSON<{ slots: BrainstormSlot[] }>(`/brainstorm/slots?${new URLSearchParams({ storyId })}`),
    setSlotStatus: (storyId: string, slotKey: string, status: "known" | "unknown") =>
        fetchJSON<BrainstormSlot>(`/brainstorm/slots/${slotKey}`, { method: "PATCH", body: JSON.stringify({ storyId, status }) })
};
