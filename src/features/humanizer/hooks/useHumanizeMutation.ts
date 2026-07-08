import { useMutation } from "@tanstack/react-query";
import { humanizerApi } from "@/services/api/client";

export const useHumanizeMutation = () =>
    useMutation({
        mutationFn: (text: string) => humanizerApi.rewrite(text)
    });
