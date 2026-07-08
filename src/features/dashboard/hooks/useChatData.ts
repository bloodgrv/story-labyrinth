import { useQuery } from "@tanstack/react-query";
import { chatsApi } from "@/services/api/client";

const keys = {
    chat: (id: string) => ["chats", "detail", id] as const,
    proposals: (id: string) => ["chats", "proposals", id] as const
};

export const useChatData = (chatId: string) => {
    const chat = useQuery({
        queryKey: keys.chat(chatId),
        queryFn: () => chatsApi.getById(chatId),
        enabled: !!chatId
    });

    const proposals = useQuery({
        queryKey: keys.proposals(chatId),
        queryFn: () => chatsApi.getProposals(chatId),
        enabled: !!chatId
    });

    return {
        chat: chat.data,
        isLoadingChat: chat.isLoading,
        isChatError: chat.isError,
        chatError: chat.error as Error | null,
        proposals: proposals.data ?? [],
        isLoadingProposals: proposals.isLoading
    };
};
