import { useQuery } from "@tanstack/react-query";
import { outlineApi } from "@/services/api/client";

export const characterArcKeys = {
    all: ["characterArc"] as const,
    byCharacter: (storyId: string, characterId: string) => [...characterArcKeys.all, storyId, characterId] as const
};

export const useCharacterArcQuery = (storyId: string, characterId: string | undefined) =>
    useQuery({
        queryKey: characterArcKeys.byCharacter(storyId, characterId ?? ""),
        queryFn: () => outlineApi.getArc(storyId, characterId ?? ""),
        enabled: !!storyId && !!characterId
    });
