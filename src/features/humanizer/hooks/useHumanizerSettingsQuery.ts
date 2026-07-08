import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { humanizerApi } from "@/services/api/client";
import type { HumanizerSettings } from "@/types/humanizerSettings";

export const humanizerSettingsKeys = {
    all: ["humanizer"] as const,
    settings: () => [...humanizerSettingsKeys.all, "settings"] as const
};

export const useHumanizerSettingsQuery = () =>
    useQuery({
        queryKey: humanizerSettingsKeys.settings(),
        queryFn: humanizerApi.getSettings,
        staleTime: 5 * 60 * 1000
    });

export const useUpdateHumanizerSettingsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<HumanizerSettings> }) =>
            humanizerApi.updateSettings(id, data),
        onSuccess: updated => {
            queryClient.setQueryData(humanizerSettingsKeys.settings(), updated);
        },
        onError: () => {
            toast.error("Failed to update Humanizer settings");
        }
    });
};
