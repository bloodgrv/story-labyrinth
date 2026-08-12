import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { lorebookApi } from "@/services/api/client";
import { storyGraphKeys } from "@/features/story-graph/hooks/useStoryGraphQuery";
import type { LorebookEntry } from "@/types/story";

// Query keys
export const lorebookKeys = {
    all: ["lorebook"] as const,
    lists: () => [...lorebookKeys.all, "list"] as const,
    list: (storyId?: string) => [...lorebookKeys.lists(), storyId ?? "all"] as const,
    details: () => [...lorebookKeys.all, "detail"] as const,
    detail: (id: string) => [...lorebookKeys.details(), id] as const,

    // Level-based query keys
    global: () => [...lorebookKeys.all, "global"] as const,
    series: (seriesId: string) => [...lorebookKeys.all, "series", seriesId] as const,
    story: (storyId: string) => [...lorebookKeys.all, "story", storyId] as const,
    hierarchical: (storyId: string) => [...lorebookKeys.all, "hierarchical", storyId] as const,

    // Legacy keys (backward compatibility)
    byStory: (storyId: string) => ["lorebook", "story", storyId] as const,
    byCategory: (storyId: string, category: string) => ["lorebook", "story", storyId, "category", category] as const,
    byTag: (storyId: string, tag: string) => ["lorebook", "story", storyId, "tag", tag] as const
};

// Fetch lorebook entries by story (legacy - returns hierarchical)
export const useLorebookByStoryQuery = (storyId: string) =>
    useQuery({
        queryKey: lorebookKeys.byStory(storyId),
        queryFn: () => lorebookApi.getByStory(storyId),
        enabled: !!storyId
    });

// Query: Series-level lorebook entries
export const useSeriesLorebookQuery = (seriesId: string | undefined) =>
    useQuery({
        queryKey: lorebookKeys.series(seriesId ?? ""),
        queryFn: () => lorebookApi.getBySeries(seriesId ?? ""),
        enabled: !!seriesId
    });

// Query: Story-level lorebook entries only
export const useStoryLorebookQuery = (storyId: string | undefined) =>
    useQuery({
        queryKey: lorebookKeys.story(storyId ?? ""),
        queryFn: () => lorebookApi.getByStory(storyId ?? ""),
        enabled: !!storyId
    });

// Query: Hierarchical lorebook (global + series + story)
// CRITICAL: This is what prompt context should use
export const useHierarchicalLorebookQuery = (storyId: string | undefined) =>
    useQuery({
        queryKey: lorebookKeys.hierarchical(storyId ?? ""),
        queryFn: () => lorebookApi.getHierarchical(storyId ?? ""),
        enabled: !!storyId
    });

// Create lorebook entry mutation
export const useCreateLorebookMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: lorebookApi.create,
        onSuccess: newEntry => {
            // Invalidate based on entry level
            if (newEntry.level === "global") queryClient.invalidateQueries({ queryKey: lorebookKeys.global() });
            else if (newEntry.level === "series" && newEntry.scopeId)
                queryClient.invalidateQueries({ queryKey: lorebookKeys.series(newEntry.scopeId) });
            else if (newEntry.level === "story" && newEntry.scopeId) {
                queryClient.invalidateQueries({ queryKey: lorebookKeys.story(newEntry.scopeId) });
                queryClient.invalidateQueries({ queryKey: lorebookKeys.hierarchical(newEntry.scopeId) });
            }

            // Also invalidate list query
            queryClient.invalidateQueries({ queryKey: lorebookKeys.lists() });

            toast.success("Lorebook entry created successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to create lorebook entry: ${error.message}`);
        }
    });
};

// Update lorebook entry mutation
export const useUpdateLorebookMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<LorebookEntry> }) => lorebookApi.update(id, data),
        onSuccess: () => {
            // Just invalidate ALL lorebook queries - simpler and actually works
            queryClient.invalidateQueries({ queryKey: lorebookKeys.all });

            toast.success("Lorebook entry updated successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to update lorebook entry: ${error.message}`);
        }
    });
};

// Scribble autosave — silent (no toast, no full-list invalidation) since this fires on every
// debounced keystroke, mirroring useUpdateChapterMutation's own silent-success pattern rather than
// useUpdateLorebookMutation's toast+invalidate-all (which would spam toasts and thrash the list
// cache on every autosave tick). Scribble content isn't shown anywhere else, so no cache write-back
// is needed on success either.
export const useUpdateLorebookScribbleMutation = () =>
    useMutation({
        mutationFn: ({ id, data }: { id: string; data: Pick<LorebookEntry, "scribble"> }) => lorebookApi.update(id, data),
        onError: () => {
            toast.error("Failed to save scribble");
        }
    });

// Delete lorebook entry mutation
export const useDeleteLorebookMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: lorebookApi.delete,
        onMutate: async id => {
            // Get entry before deletion to know which queries to invalidate
            const entry = queryClient.getQueryData<LorebookEntry>(lorebookKeys.detail(id));
            return { entry };
        },
        onSuccess: (_, __, context) => {
            const entry = context?.entry;

            if (entry) 
                // Invalidate level-based queries
                if (entry.level === "global") queryClient.invalidateQueries({ queryKey: lorebookKeys.global() });
                else if (entry.level === "series" && entry.scopeId)
                    queryClient.invalidateQueries({ queryKey: lorebookKeys.series(entry.scopeId) });
                else if (entry.level === "story" && entry.scopeId) {
                    queryClient.invalidateQueries({ queryKey: lorebookKeys.story(entry.scopeId) });
                    queryClient.invalidateQueries({ queryKey: lorebookKeys.hierarchical(entry.scopeId) });
                }
            

            // Always invalidate lists as fallback
            queryClient.invalidateQueries({ queryKey: lorebookKeys.lists() });

            // The server cascade-deletes this entry's storyGraphEdges (server/routes/lorebook.ts),
            // but that's invisible to the graph's own query cache — without this, a just-deleted
            // entry can linger as a ghost node/edge in the Relationships tool until the default
            // 1-minute staleTime lapses.
            queryClient.invalidateQueries({ queryKey: storyGraphKeys.all });

            toast.success("Lorebook entry deleted successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to delete lorebook entry: ${error.message}`);
        }
    });
};
