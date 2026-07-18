import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { RagIssueSeverity, RagIssueStatus, RagIssueType, RagScanIssue } from "@/types/ragScan";

const SEVERITY_VARIANT: Record<RagIssueSeverity, "default" | "secondary" | "destructive" | "outline"> = {
    high: "destructive",
    medium: "secondary",
    low: "outline"
};

const ISSUE_TYPE_LABELS: Record<RagIssueType, string> = {
    contradiction: "Contradiction",
    state_mismatch: "State mismatch",
    timeline: "Timeline",
    other: "Other"
};

interface IssueCardProps {
    issue: RagScanIssue;
    onUpdateStatus: (status: RagIssueStatus) => void;
    isUpdating: boolean;
    // Only the story-wide panel resolves/passes this — the chapter drawer is already scoped to
    // one chapter, so a "go to chapter" link there would be a no-op.
    chapterLabel?: string;
    onGoToChapter?: () => void;
}

export function IssueCard({ issue, onUpdateStatus, isUpdating, chapterLabel, onGoToChapter }: IssueCardProps) {
    const isOpen = issue.status === "open";

    return (
        <Card className={issue.status === "dismissed" ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={SEVERITY_VARIANT[issue.severity]} className="capitalize">
                            {issue.severity}
                        </Badge>
                        <Badge variant="outline">{ISSUE_TYPE_LABELS[issue.issueType]}</Badge>
                        {!isOpen && (
                            <Badge variant={issue.status === "resolved" ? "default" : "outline"} className="capitalize">
                                {issue.status}
                            </Badge>
                        )}
                    </div>
                    {chapterLabel && onGoToChapter && (
                        <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={onGoToChapter}>
                            {chapterLabel}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm">{issue.description}</p>

                {issue.suggestedFix && (
                    <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Suggested fix: </span>
                        {issue.suggestedFix}
                    </p>
                )}

                {issue.evidence.length > 0 && (
                    <div className="space-y-1.5">
                        {issue.evidence.map((ev, i) => (
                            <blockquote key={i} className="border-l-2 pl-2 text-xs text-muted-foreground">
                                <span className="font-medium capitalize">{ev.source}</span>
                                {ev.label ? ` — ${ev.label}` : ""}: "{ev.excerpt}"
                            </blockquote>
                        ))}
                    </div>
                )}

                <div className="flex gap-2">
                    {isOpen ? (
                        <>
                            <Button size="sm" onClick={() => onUpdateStatus("resolved")} disabled={isUpdating}>
                                {isUpdating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                Resolve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onUpdateStatus("dismissed")} disabled={isUpdating}>
                                <X className="h-4 w-4 mr-1" />
                                Dismiss
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" variant="ghost" onClick={() => onUpdateStatus("open")} disabled={isUpdating}>
                            {isUpdating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                            Reopen
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
