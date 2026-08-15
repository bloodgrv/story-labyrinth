import { Loader2, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useAppendToScribble, formatScribbleBlock } from "@/features/chapters/hooks/useAppendToScribble";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AiReviewFindingStatus, AiReviewTag } from "@/types/aiReview";
import {
    useReviewJobWithInvalidation,
    useStoryFindingsQuery,
    useTriggerQuickReviewMutation,
    useUpdateFindingStatusMutation
} from "../hooks/useAiReviewQuery";
import { FindingCard } from "./FindingCard";

const STATUS_TABS: { value: AiReviewFindingStatus; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" }
];

const TAG_OPTIONS: { value: AiReviewTag | "all"; label: string }[] = [
    { value: "all", label: "All tags" },
    { value: "dev", label: "Dev" },
    { value: "continuity", label: "Continuity" },
    { value: "voice", label: "Voice" },
    { value: "line", label: "Line" }
];

interface AiReviewPanelProps {
    storyId: string;
}

// Story-wide "AI Review" sidebar tool (Sidebar.tsx "ai-review" entry, docs/AI_Review_Design.md).
// Quick mode only this pass (AR0-AR4) — Deep's staged map/cross-chapter/voice pipeline is AR5.
export function AiReviewPanel({ storyId }: AiReviewPanelProps) {
    const isOwner = useIsOwner();
    const [statusTab, setStatusTab] = useState<AiReviewFindingStatus>("open");
    const [tagFilter, setTagFilter] = useState<AiReviewTag | "all">("all");
    const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
    const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);
    const { setCurrentChapterId, setCurrentTool, setPendingChatComposerSeed, pendingAiReviewChapterId, setPendingAiReviewChapterId } =
        useStoryContext();

    const { data: chapters } = useChaptersByStoryQuery(storyId);
    const triggerMutation = useTriggerQuickReviewMutation();
    const { data: job } = useReviewJobWithInvalidation(triggeredJobId, storyId);
    const { data: findingsData, isLoading: findingsLoading } = useStoryFindingsQuery(storyId, {
        status: statusTab,
        tag: tagFilter === "all" ? undefined : tagFilter
    });
    const updateStatusMutation = useUpdateFindingStatusMutation(storyId);
    const { appendToScribble, isPending: isAppending } = useAppendToScribble();
    const [appendingFindingId, setAppendingFindingId] = useState<string | null>(null);

    const chapterList = chapters ?? [];
    const chapterTitleById = new Map(chapterList.map(c => [c.id, c.title]));
    const isJobActive = job?.status === "queued" || job?.status === "running";
    const findings = findingsData?.findings ?? [];

    // Editor's "Review this chapter" entry point (AR4) — pre-check the chapter it was opened
    // from, consumed once.
    useEffect(() => {
        if (!pendingAiReviewChapterId) return;
        setSelectedChapterIds(prev => new Set(prev).add(pendingAiReviewChapterId));
        setPendingAiReviewChapterId(null);
    }, [pendingAiReviewChapterId, setPendingAiReviewChapterId]);

    const toggleChapter = (chapterId: string) => {
        setSelectedChapterIds(prev => {
            const next = new Set(prev);
            if (next.has(chapterId)) next.delete(chapterId);
            else next.add(chapterId);
            return next;
        });
    };

    const allSelected = chapterList.length > 0 && selectedChapterIds.size === chapterList.length;
    const toggleSelectAll = () => {
        setSelectedChapterIds(allSelected ? new Set() : new Set(chapterList.map(c => c.id)));
    };

    const handleRun = () => {
        if (selectedChapterIds.size === 0) return;
        triggerMutation.mutate(
            { storyId, chapterIds: [...selectedChapterIds] },
            { onSuccess: result => setTriggeredJobId(result.id) }
        );
    };

    const goToChapter = (chapterId: string) => {
        setCurrentChapterId(chapterId);
        setCurrentTool("editor");
    };

    const handleAddToScribble = async (findingId: string) => {
        const finding = findings.find(f => f.id === findingId);
        if (!finding?.chapterId) return;
        const chapter = chapterList.find(c => c.id === finding.chapterId);
        if (!chapter) return;

        setAppendingFindingId(findingId);
        try {
            const block = formatScribbleBlock([
                `--- AI Review · ${finding.tag} · ${finding.severity} · ${new Date(finding.createdAt).toLocaleDateString()} ---`,
                `Issue: ${finding.title}`,
                `Why it matters: ${finding.description}`,
                finding.excerpt ? `Excerpt: "${finding.excerpt}"` : null,
                finding.direction ? `Direction: ${finding.direction}` : null
            ]);
            await appendToScribble(chapter, block);
        } finally {
            setAppendingFindingId(null);
        }
    };

    const handleSendToEditorChat = (findingId: string) => {
        const finding = findings.find(f => f.id === findingId);
        if (!finding) return;
        const chapterLabel = finding.chapterId ? (chapterTitleById.get(finding.chapterId) ?? "Chapter") : null;

        const lines = [
            `[AI Review — ${finding.tag} | ${finding.severity}]`,
            chapterLabel ? `Chapter: ${chapterLabel}` : null,
            `Issue: ${finding.title}`,
            `Why it matters: ${finding.description}`,
            finding.excerpt ? `Excerpt: "${finding.excerpt}"` : null,
            finding.direction ? `Direction (optional): ${finding.direction}` : null
        ].filter((l): l is string => !!l);

        setPendingChatComposerSeed({ tool: "editor", text: lines.join("\n") });
        if (finding.chapterId) setCurrentChapterId(finding.chapterId);
        setCurrentTool("editor");
    };

    return (
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
            <div>
                <h2 className="text-lg font-semibold">AI Review</h2>
                <p className="text-sm text-muted-foreground">
                    Dev, soft continuity, and voice notes on the chapters you pick — an editorial read, not a fact
                    check (that's the RAG Scanner).
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Chapters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Button size="sm" variant="outline" onClick={toggleSelectAll} disabled={chapterList.length === 0}>
                            {allSelected ? "Deselect all" : "Select all"}
                        </Button>
                        {isOwner ? (
                            <Button onClick={handleRun} disabled={selectedChapterIds.size === 0 || triggerMutation.isPending || isJobActive}>
                                {triggerMutation.isPending || isJobActive ? (
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                ) : (
                                    <ScanSearch className="h-4 w-4 mr-1.5" />
                                )}
                                Run Quick review
                            </Button>
                        ) : (
                            <p className="text-xs text-muted-foreground">Only the story owner can run a review.</p>
                        )}
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y rounded-md border border-border">
                        {chapterList.map(chapter => (
                            <label key={chapter.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                                <Switch checked={selectedChapterIds.has(chapter.id)} onCheckedChange={() => toggleChapter(chapter.id)} />
                                <span>{chapter.title}</span>
                            </label>
                        ))}
                        {chapterList.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No chapters yet.</p>}
                    </div>

                    {job && (
                        <p className="text-sm text-muted-foreground">
                            {job.status === "failed"
                                ? `Last review failed: ${job.error}`
                                : (job.progress?.message ?? (isJobActive ? "Reviewing…" : "Review complete."))}
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Findings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Tabs value={statusTab} onValueChange={v => setStatusTab(v as AiReviewFindingStatus)}>
                            <TabsList>
                                {STATUS_TABS.map(tab => (
                                    <TabsTrigger key={tab.value} value={tab.value}>
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <Select value={tagFilter} onValueChange={v => setTagFilter(v as AiReviewTag | "all")}>
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TAG_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {findingsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : findings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No {statusTab} findings.</p>
                    ) : (
                        <div className="space-y-3">
                            {findings.map(finding => (
                                <FindingCard
                                    key={finding.id}
                                    finding={finding}
                                    isUpdating={updateStatusMutation.isPending && updateStatusMutation.variables?.findingId === finding.id}
                                    onUpdateStatus={status => updateStatusMutation.mutate({ findingId: finding.id, status })}
                                    chapterLabel={finding.chapterId ? (chapterTitleById.get(finding.chapterId) ?? "Chapter") : undefined}
                                    onGoToChapter={finding.chapterId ? () => goToChapter(finding.chapterId as string) : undefined}
                                    onAddToScribble={finding.chapterId ? () => handleAddToScribble(finding.id) : undefined}
                                    isAddingToScribble={isAppending && appendingFindingId === finding.id}
                                    onSendToEditorChat={() => handleSendToEditorChat(finding.id)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
