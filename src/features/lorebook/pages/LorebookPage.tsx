import { attempt, attemptPromise } from "@jfdi/attempt";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useState } from "react";
import { useParams } from "react-router";
import { toast } from "react-toastify";
import { lorebookApi } from "@/services/api/client";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { randomUUID } from "@/utils/crypto";
import { logger } from "@/utils/logger";
import { CreateEntryDialog } from "../components/CreateEntryDialog";
import { LorebookBrowsePanel } from "../components/LorebookBrowsePanel";
import { LorebookEntryTab } from "../components/LorebookEntryTab";
import type { LorebookCategory } from "../components/form";
import { LorebookImportDraftTab } from "../components/LorebookImportDraftTab";
import { LorebookTabStrip, type LorebookOpenTab } from "../components/LorebookTabStrip";
import { lorebookKeys, useHierarchicalLorebookQuery, useSeriesLorebookQuery } from "../hooks/useLorebookQuery";
import { exportEntries, importEntries } from "../stores/LorebookImportExportService";

// Formats that go through the AI-extraction import path (documentImportService.ts) rather than
// the JSON bulk-import path — JSON entries are already in this app's own shape, these aren't.
const DOCUMENT_IMPORT_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

interface LorebookPageProps {
    storyId?: string;
    seriesId?: string;
}

export default function LorebookPage({ storyId: propStoryId, seriesId: propSeriesId }: LorebookPageProps = {}) {
    const params = useParams<{ storyId?: string; seriesId?: string }>();
    const queryClient = useQueryClient();

    // Use props if provided, otherwise fall back to params
    const storyId = propStoryId ?? params.storyId;
    const seriesId = propSeriesId ?? params.seriesId;

    const [selectedCategory, setSelectedCategory] = useState<LorebookCategory>("character");
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [openTabs, setOpenTabs] = useState<LorebookOpenTab[]>([{ kind: "browse" }]);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isImportingDocument, setIsImportingDocument] = useState(false);

    // Fetch appropriate entries based on context
    const { data: storyEntries, isLoading: storyLoading, refetch: refetchStory, isFetching: isFetchingStory } =
        useHierarchicalLorebookQuery(storyId);
    const { data: seriesEntries, isLoading: seriesLoading, refetch: refetchSeries, isFetching: isFetchingSeries } =
        useSeriesLorebookQuery(seriesId);

    const entries = storyId ? storyEntries || [] : seriesEntries || [];
    const isLoading = storyId ? storyLoading : seriesLoading;
    const isRefreshing = storyId ? isFetchingStory : isFetchingSeries;
    const refetchEntries = storyId ? refetchStory : refetchSeries;

    // Filter by category
    const entriesByCategory = entries.filter(e => e.category === selectedCategory);

    // Calculate category counts from the current entries
    const categoryCounts = entries.reduce(
        (acc, entry) => {
            acc[entry.category] = (acc[entry.category] || 0) + 1;
            return acc;
        },
        {} as Record<LorebookCategory, number>
    );

    const activeTab = openTabs[activeTabIndex] ?? openTabs[0];
    const activeEntry = activeTab.kind === "entry" ? entries.find(e => e.id === activeTab.entryId) : undefined;

    const openEntryTab = (entry: LorebookEntry) => {
        const existingIdx = openTabs.findIndex(t => t.kind === "entry" && t.entryId === entry.id);
        if (existingIdx >= 0) {
            setActiveTabIndex(existingIdx);
            return;
        }
        setActiveTabIndex(openTabs.length);
        setOpenTabs(prev => [...prev, { kind: "entry", entryId: entry.id }]);
    };

    // Consume the Relationships graph's "open entry" pointer (StoryContext.pendingLorebookEntryId)
    // once entries have loaded — one-shot, mirrors useWorkspaceDeepLink.ts's own pattern. Guarded
    // on isLoading since `entries` starts empty on first mount right after a tool switch.
    const { pendingLorebookEntryId, setPendingLorebookEntryId } = useStoryContext();
    useEffect(() => {
        if (!pendingLorebookEntryId || isLoading) return;
        const entry = entries.find(e => e.id === pendingLorebookEntryId);
        if (entry) openEntryTab(entry);
        else toast.error("That entry could not be found");
        setPendingLorebookEntryId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingLorebookEntryId, isLoading, entries]);

    const openDraftTab = (draft: DocumentImportDraft) => {
        setActiveTabIndex(openTabs.length);
        setOpenTabs(prev => [...prev, { kind: "draft", draftId: randomUUID(), draft }]);
    };

    const closeTab = (index: number) => {
        if (openTabs[index]?.kind === "browse") return;
        setOpenTabs(prev => prev.filter((_, i) => i !== index));
        setActiveTabIndex(current => {
            if (index < current) return current - 1;
            if (index === current) return Math.max(0, current - 1);
            return current;
        });
    };

    // Handle export functionality
    const handleExport = async () => {
        if (storyId) {
            const [error] = attempt(() => exportEntries(entries, storyId));
            if (error) {
                logger.error("Export failed:", error);
                toast.error("Failed to export lorebook entries");
                return;
            }
            toast.success("Lorebook entries exported successfully");
        }
    };

    // Handle JSON bulk-import (this app's own export shape) — unchanged silent-create path.
    const handleJsonImport = (file: File) => {
        if (!storyId) return;

        const reader = new FileReader();
        reader.onload = async e => {
            const [error] = await attemptPromise(async () => {
                const content = e.target?.result as string;
                await importEntries(content, storyId, () => {
                    queryClient.invalidateQueries({ queryKey: lorebookKeys.byStory(storyId) });
                });
            });
            if (error) {
                logger.error("Import failed:", error);
                toast.error("Failed to import lorebook entries");
                return;
            }
            toast.success("Lorebook entries imported successfully");
        };
        reader.readAsText(file);
    };

    // Handle a PDF/DOCX/MD/TXT reference document — AI-extracts a draft entry (documentImportService.ts
    // server-side) and opens it as a new tab for review, nothing is persisted until Create is pressed.
    const handleDocumentImport = async (file: File) => {
        setIsImportingDocument(true);
        const [error, result] = await attemptPromise(() => lorebookApi.importDocument(file));
        setIsImportingDocument(false);

        if (error) {
            logger.error("Document import failed:", error);
            toast.error(error.message || "Failed to import document");
            return;
        }
        openDraftTab(result.draft);
    };

    const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        const file = event.target.files[0];
        const isDocument = DOCUMENT_IMPORT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));

        if (isDocument) void handleDocumentImport(file);
        else handleJsonImport(file);

        // Reset the input
        event.target.value = "";
    };

    return (
        <div className="flex h-full flex-col">
            <LorebookTabStrip
                tabs={openTabs}
                activeIndex={activeTabIndex}
                entries={entries}
                onSelect={setActiveTabIndex}
                onClose={closeTab}
            />

            {activeTab.kind === "entry" ? (
                activeEntry ? (
                    <div className="flex-1 min-h-0">
                        <LorebookEntryTab
                            // Keyed on id + updatedAt (not just id) so a Refresh that pulls back
                            // changed server data (e.g. a chat-approved Codex proposal, an
                            // AI-generated image) forces a fresh mount — the form's defaultValues
                            // are only read once at mount time (see LorebookEntryEditor.tsx's own
                            // doc comment), so updating the `entry` prop alone wouldn't refresh
                            // fields already rendered.
                            key={`${activeEntry.id}-${activeEntry.updatedAt ?? ""}`}
                            entry={activeEntry}
                            storyId={storyId}
                            seriesId={seriesId}
                            onRefresh={() => void refetchEntries()}
                            isRefreshing={isRefreshing}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        This entry no longer exists.
                    </div>
                )
            ) : activeTab.kind === "draft" ? (
                <div className="flex-1 min-h-0">
                    <LorebookImportDraftTab
                        draft={activeTab.draft}
                        storyId={storyId}
                        seriesId={seriesId}
                        onSaved={() => closeTab(activeTabIndex)}
                    />
                </div>
            ) : (
                <LorebookBrowsePanel
                    seriesId={seriesId}
                    selectedCategory={selectedCategory}
                    onCategoryChange={setSelectedCategory}
                    categoryCounts={categoryCounts}
                    entriesByCategory={entriesByCategory}
                    isLoading={isLoading}
                    onRefresh={() => void refetchEntries()}
                    isRefreshing={isRefreshing}
                    onExport={handleExport}
                    onImport={handleImport}
                    isImportingDocument={isImportingDocument}
                    onOpenEntry={openEntryTab}
                    onNewEntry={() => setIsCreateDialogOpen(true)}
                />
            )}

            {/* Create dialog */}
            <CreateEntryDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                storyId={storyId}
                seriesId={seriesId}
                defaultCategory={selectedCategory}
            />
        </div>
    );
}
