import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { autoHumanizerApi } from "@/services/api/client";
import type { AutoHumanizerSettings } from "@/types/autoHumanizerSettings";

export const autoHumanizerSettingsKeys = {
    all: ["autoHumanizer"] as const,
    settings: () => [...autoHumanizerSettingsKeys.all, "settings"] as const
};

export const useAutoHumanizerSettingsQuery = () =>
    useQuery({
        queryKey: autoHumanizerSettingsKeys.settings(),
        queryFn: autoHumanizerApi.getSettings,
        staleTime: 5 * 60 * 1000
    });

export const useUpdateAutoHumanizerSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AutoHumanizerSettings> }) =>
            autoHumanizerApi.updateSettings(id, data),
        onSuccess: updated => {
            queryClient.setQueryData(autoHumanizerSettingsKeys.settings(), updated);
        },
        onError: () => {
            toast.error("Failed to update Auto Humanizer settings");
        }
    });
};
