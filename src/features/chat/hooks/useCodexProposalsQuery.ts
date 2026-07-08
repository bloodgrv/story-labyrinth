import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { lorebookKeys } from "@/features/lorebook/hooks/useLorebookQuery";
import { chatsApi, codexApi } from "@/services/api/client";
import type { ParsedCodexProposal } from "../services/parseCodexProposals";
import type { CodexPendingChange, CodexPendingStatus, CodexState } from "@/types/codex";

const proposalKeys = {
    forChat: (chatId: string, status?: CodexPendingStatus) => ["codex-proposals", "chat", chatId, status ?? "all"] as const
};

export const useChatProposalsQuery = (chatId: string | undefined, status?: CodexPendingStatus) =>
    useQuery({
        queryKey: proposalKeys.forChat(chatId ?? "", status),
        queryFn: () => chatsApi.getProposals(chatId ?? "", status),
        enabled: !!chatId
    });

// Groups proposals by the chat message that generated them, for rendering inline under
// the assistant message that produced each one.
export const groupProposalsByMessage = (proposals: CodexPendingChange[]): Record<string, CodexPendingChange[]> =>
    proposals.reduce<Record<string, CodexPendingChange[]>>((byMessage, proposal) => {
        const messageId = proposal.sourceRef?.split(":msg:")[1];
        if (!messageId) return byMessage;
        (byMessage[messageId] ??= []).push(proposal);
        return byMessage;
    }, {});

export const useCreateProposalMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ chatId, data }: { chatId: string; data: { messageId?: string } & ParsedCodexProposal }) =>
            data.type === "new_entry" ? chatsApi.proposeNewEntry(chatId, data) : chatsApi.proposeModifyEntry(chatId, data),
        onSuccess: (_result, { chatId }) => {
            queryClient.invalidateQueries({ queryKey: proposalKeys.forChat(chatId) });
        },
        onError: (error: Error) => toast.error(`Failed to record Codex proposal: ${error.message}`)
    });
};

export const useApproveProposalMutation = (chatId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (pendingChangeId: string) => codexApi.approve(pendingChangeId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: proposalKeys.forChat(chatId) });
            queryClient.invalidateQueries({ queryKey: lorebookKeys.all });
            toast.success("Codex entry updated");
        },
        onError: (error: Error) => toast.error(`Failed to approve proposal: ${error.message}`)
    });
};

export const useRejectProposalMutation = (chatId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (pendingChangeId: string) => codexApi.reject(pendingChangeId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: proposalKeys.forChat(chatId) }),
        onError: (error: Error) => toast.error(`Failed to reject proposal: ${error.message}`)
    });
};

export const useReviseProposalMutation = (chatId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            pendingChangeId,
            data
        }: {
            pendingChangeId: string;
            data: { proposedDescription?: string; proposedState?: CodexState; proposedTags?: string[]; proposedNeedsFleshingOut?: boolean };
        }) => chatsApi.reviseProposal(chatId, pendingChangeId, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: proposalKeys.forChat(chatId) }),
        onError: (error: Error) => toast.error(`Failed to revise proposal: ${error.message}`)
    });
};
