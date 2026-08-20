import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { writerPrefsSettingsApi } from "@/services/api/client";
import type { WriterPrefsSettings } from "@/types/writerPrefsSettings";

export const writerPrefsSettingsKeys = {
    all: ["writerPrefsSettings"] as const,
    settings: () => [...writerPrefsSettingsKeys.all, "settings"] as const
};

export const useWriterPrefsSettingsQuery = () =>
    useQuery({
        queryKey: writerPrefsSettingsKeys.settings(),
        queryFn: writerPrefsSettingsApi.getSettings,
        staleTime: 5 * 60 * 1000
    });

export const useUpdateWriterPrefsSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<WriterPrefsSettings> }) =>
            writerPrefsSettingsApi.updateSettings(id, data),
        onSuccess: updated => {
            queryClient.setQueryData(writerPrefsSettingsKeys.settings(), updated);
        },
        onError: () => {
            toast.error("Failed to update Writer Preferences auto-learn setting");
        }
    });
};
