import { useCreateNoteMutation } from "@/features/notes/hooks/useNotesQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { useUpdateStoryMutation } from "@/features/stories/hooks/useStoriesQuery";
import { agentMemoriesApi, deskTransfersApi } from "@/services/api/client";
import { AGENT_MEMORY_CATEGORIES, type AgentMemoryCategory } from "@/types/agentMemory";
import type { BrainstormChecklistItem, HandoffPacket, OverviewProposalPayload } from "@/types/brainstorm";
import { useUpdateChecklistStatusMutation } from "./useBrainstormChecklistQuery";
import { useSetSlotStatusMutation } from "./useBrainstormSlotsQuery";

interface UseBrainstormChecklistActionsParams {
    chatId: string;
    storyId: string;
    fromChatTitleSnapshot: string;
}

// B3 fix (2026-08-19): handleAcceptOverview/handleOpenHandoff extracted out of
// BrainstormChecklistTray.tsx (unchanged behavior) so a NEW inline card rendered right in the
// chat transcript (OverviewProposalCard.tsx/HandoffPacketCard.tsx, ChatInterface.tsx) can perform
// the exact same accept/open action the Approvals tray already does, instead of duplicating this
// logic or leaving the inline card unable to actually do anything. See docs/BUGS_2026-08-19.md B3.
export function useBrainstormChecklistActions({ chatId, storyId, fromChatTitleSnapshot }: UseBrainstormChecklistActionsParams) {
    const updateStatus = useUpdateChecklistStatusMutation();
    const updateStory = useUpdateStoryMutation();
    const createNote = useCreateNoteMutation();
    const setSlotStatus = useSetSlotStatusMutation(storyId);
    const { setPendingLorebookSeed, setPendingChatComposerSeed, setCurrentTool } = useStoryContext();

    const isBusy = updateStatus.isPending || updateStory.isPending || createNote.isPending;

    // Accept performs the actual write (synopsis/note/memory) then moves the row to "opened" —
    // NOT "done": per B4's doctrine, only the user's own explicit Mark done leaves the active
    // queue, even for an action that already completed.
    const handleAcceptOverview = (item: BrainstormChecklistItem) => {
        const payload = item.payload as OverviewProposalPayload;
        if (payload.proposalType === "synopsis") updateStory.mutate({ id: storyId, data: { synopsis: payload.content } });
        else if (payload.proposalType === "note")
            createNote.mutate({ storyId, title: payload.title, content: payload.content, type: payload.noteType });
        else if (payload.proposalType === "memory") {
            const category: AgentMemoryCategory = AGENT_MEMORY_CATEGORIES.includes(payload.category as AgentMemoryCategory)
                ? (payload.category as AgentMemoryCategory)
                : "project_note";
            void agentMemoriesApi.createNote({ storyId, category, title: payload.title, body: payload.body });
        }
        if (payload.slotKey) setSlotStatus.mutate({ slotKey: payload.slotKey, status: "known" });
        updateStatus.mutate({ id: item.id, status: "opened" });
        if (payload.proposalType === "note")
            deskTransfersApi
                .log(storyId, {
                    event: "opened",
                    kind: "overview_proposal",
                    fromDesk: "brainstorm",
                    fromChatId: chatId,
                    fromChatTitleSnapshot,
                    toDesk: "notes",
                    subject: payload.title,
                    sourceChecklistItemId: item.id
                })
                .catch(() => {});
    };

    const handleOpenHandoff = (item: BrainstormChecklistItem) => {
        const payload = item.payload as HandoffPacket;
        if (payload.destination === "worldbuilding") {
            setPendingLorebookSeed({
                name: payload.seedName || payload.summary.slice(0, 60),
                category: payload.seedCategory ?? "character",
                blurb: payload.summary,
                detail: payload.detail
            });
            setCurrentTool("lorebook");
        } else {
            setPendingChatComposerSeed({ tool: payload.destination, text: payload.detail });
            setCurrentTool(payload.destination);
        }
        updateStatus.mutate({ id: item.id, status: "opened" });
        deskTransfersApi
            .log(storyId, {
                event: "opened",
                kind: "handoff",
                fromDesk: "brainstorm",
                fromChatId: chatId,
                fromChatTitleSnapshot,
                toDesk: payload.destination,
                subject: payload.summary,
                crumb: payload.detail,
                sourceChecklistItemId: item.id
            })
            .catch(() => {});
    };

    const markDone = (id: string) => updateStatus.mutate({ id, status: "done" });

    // Distinct from markDone — for a proposal that's stale/changed/no longer wanted, never acted
    // on. Shares the "dismissed" status the schema/server already supported but no UI ever
    // exposed (both land in the Done tab alongside "done").
    const dismiss = (id: string) => updateStatus.mutate({ id, status: "dismissed" });

    return { handleAcceptOverview, handleOpenHandoff, markDone, dismiss, isBusy };
}
