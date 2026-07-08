import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { grammarApi } from "@/services/api/client";
import type { GrammarSettings } from "@/types/grammarSettings";

export const grammarSettingsKeys = {
    all: ["grammar"] as const,
    settings: () => [...grammarSettingsKeys.all, "settings"] as const
};

export const useGrammarSettingsQuery = () =>
    useQuery({
        queryKey: grammarSettingsKeys.settings(),
        queryFn: grammarApi.getSettings,
        staleTime: 5 * 60 * 1000
    });

export const useUpdateGrammarSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<GrammarSettings> }) =>
            grammarApi.updateSettings(id, data),
        onSuccess: updated => {
            queryClient.setQueryData(grammarSettingsKeys.settings(), updated);
        },
        onError: () => {
            toast.error("Failed to update Grammar Checker settings");
        }
    });
};

export const useTestGrammarConnectionMutation = () =>
    useMutation({
        mutationFn: (serverUrl: string) => grammarApi.testConnection(serverUrl),
        onSuccess: result => {
            if (result.success) toast.success(result.message);
            else toast.error(result.message);
        },
        onError: () => {
            toast.error("Test connection failed");
        }
    });
