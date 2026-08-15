import { Loader2, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { useAppendToScribble, formatScribbleBlock } from "@/features/chapters/hooks/useAppendToScribble";
import { useChaptersByStoryQuery } from "@/features/chapters/hooks/useChaptersQuery";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import type { AiReviewFindingStatus, AiReviewMode, AiReviewTag } from "@/types/aiReview";
import {
    useReviewJobWithInvalidation,
    useStoryFindingsQuery,
    useTriggerDeepReviewMutation,
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

const MODES: { value: AiReviewMode; label: string }[] = [
    { value: "quick", label: "Quick" },
    { value: "deep", label: "Deep" }
];

interface AiReviewPanelProps {
    storyId: string;
}

// Story-wide "AI Review" sidebar tool (Sidebar.tsx "ai-review" entry, docs/AI_Review_Design.md).
// Quick = one LLM pass; Deep = staged map -> cross-chapter -> voice -> merge pipeline (AR5),
// with optional context toggles (Project Memory / Story Timeline / line-level nitpicks / cast
// Codex) — Quick has none of these in v1, matching the design's "Quick: synopsis + RAG only"
// framing.
export function AiReviewPanel({ storyId }: AiReviewPanelProps) {
    const isOwner = useIsOwner();
    const [statusTab, setStatusTab] = useState<AiReviewFindingStatus>("open");
    const [tagFilter, setTagFilter] = useState<AiReviewTag | "all">("all");
    const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
    const [triggeredJobId, setTriggeredJobId] = useState<string | null>(null);
    const [mode, setMode] = useState<AiReviewMode>("quick");
    const [includeMemory, setIncludeMemory] = useState(false);
    const [includeTimeline, setIncludeTimeline] = useState(false);
    const [includeLine, setIncludeLine] = useState(false);
    const [includeCast, setIncludeCast] = useState(false);
    const { setCurrentChapterId, setCurrentTool, setPendingChatComposerSeed, pendingAiReviewChapterId, setPendingAiReviewChapterId } =
        useStoryContext();

    const { data: chapters } = useChaptersByStoryQuery(storyId);
    const triggerQuickMutation = useTriggerQuickReviewMutation();
    const triggerDeepMutation = useTriggerDeepReviewMutation();
    const isTriggering = triggerQuickMutation.isPending || triggerDeepMutation.isPending;
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
        const chapterIds = [...selectedChapterIds];
        if (mode === "quick") {
            triggerQuickMutation.mutate({ storyId, chapterIds }, { onSuccess: result => setTriggeredJobId(result.id) });
        } else {
            triggerDeepMutation.mutate(
                { storyId, chapterIds, options: { includeMemory, includeTimeline, includeLine, includeCast } },
                { onSuccess: result => setTriggeredJobId(result.id) }
            );
        }
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
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={toggleSelectAll} disabled={chapterList.length === 0}>
                                {allSelected ? "Deselect all" : "Select all"}
                            </Button>
                            <div className="flex rounded-md border border-border overflow-hidden">
                                {MODES.map(m => (
                                    <button
                                        key={m.value}
                                        type="button"
                                        onClick={() => setMode(m.value)}
                                        className={
                                            "px-3 py-1.5 text-sm " +
                                            (mode === m.value ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground")
                                        }
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {isOwner ? (
                            <Button onClick={handleRun} disabled={selectedChapterIds.size === 0 || isTriggering || isJobActive}>
                                {isTriggering || isJobActive ? (
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                ) : (
                                    <ScanSearch className="h-4 w-4 mr-1.5" />
                                )}
                                Run {mode === "quick" ? "Quick" : "Deep"} review
                            </Button>
                        ) : (
                            <p className="text-xs text-muted-foreground">Only the story owner can run a review.</p>
                        )}
                    </div>

                    {mode === "deep" && (
                        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
                            <div className="flex items-center gap-2">
                                <Switch id="ar-include-memory" checked={includeMemory} onCheckedChange={setIncludeMemory} />
                                <Label htmlFor="ar-include-memory" className="text-xs font-normal text-muted-foreground">
                                    Include Project Memory
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch id="ar-include-timeline" checked={includeTimeline} onCheckedChange={setIncludeTimeline} />
                                <Label htmlFor="ar-include-timeline" className="text-xs font-normal text-muted-foreground">
                                    Include Story Timeline
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch id="ar-include-line" checked={includeLine} onCheckedChange={setIncludeLine} />
                                <Label htmlFor="ar-include-line" className="text-xs font-normal text-muted-foreground">
                                    Include line-level nitpicks
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch id="ar-include-cast" checked={includeCast} onCheckedChange={setIncludeCast} />
                                <Label htmlFor="ar-include-cast" className="text-xs font-normal text-muted-foreground">
                                    Include focused cast Codex
                                </Label>
                            </div>
                        </div>
                    )}

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
