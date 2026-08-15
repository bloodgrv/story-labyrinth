import { useMutation } from "@tanstack/react-query";
import { autoHumanizerApi } from "@/services/api/client";

export const useAutoHumanizeProcessMutation = () =>
    useMutation({
        mutationFn: (text: string) => autoHumanizerApi.process(text)
    });
