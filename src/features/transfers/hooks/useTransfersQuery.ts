import { useQuery } from "@tanstack/react-query";
import { deskTransfersApi } from "@/services/api/client";

export const transfersKeys = {
    all: ["deskTransfers"] as const,
    list: (storyId: string, all: boolean) => [...transfersKeys.all, storyId, all] as const
};

export const useTransfersQuery = (storyId: string | null, all: boolean) =>
    useQuery({
        queryKey: transfersKeys.list(storyId ?? "", all),
        queryFn: () => deskTransfersApi.list(storyId as string, { all }),
        enabled: !!storyId
    });
