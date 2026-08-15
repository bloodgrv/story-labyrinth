import { Check, Copy, Loader2, MessageSquarePlus, NotebookPen, RotateCcw, X } from "lucide-react";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AiReviewFinding, AiReviewFindingStatus, AiReviewSeverity, AiReviewTag } from "@/types/aiReview";

const SEVERITY_VARIANT: Record<AiReviewSeverity, "default" | "secondary" | "destructive" | "outline"> = {
    high: "destructive",
    medium: "secondary",
    low: "outline"
};

const TAG_LABELS: Record<AiReviewTag, string> = {
    dev: "Dev",
    continuity: "Continuity",
    voice: "Voice",
    line: "Line"
};

interface FindingCardProps {
    finding: AiReviewFinding;
    onUpdateStatus: (status: AiReviewFindingStatus) => void;
    isUpdating: boolean;
    chapterLabel?: string;
    onGoToChapter?: () => void;
    onAddToScribble?: () => void;
    isAddingToScribble?: boolean;
    onSendToEditorChat?: () => void;
}

export function FindingCard({
    finding,
    onUpdateStatus,
    isUpdating,
    chapterLabel,
    onGoToChapter,
    onAddToScribble,
    isAddingToScribble,
    onSendToEditorChat
}: FindingCardProps) {
    const isOpen = finding.status === "open";

    const copyMarkdown = () => {
        const lines = [
            `**${finding.title}** (${TAG_LABELS[finding.tag]} · ${finding.severity})`,
            finding.description,
            finding.excerpt ? `> ${finding.excerpt}` : null,
            finding.direction ? `Direction: ${finding.direction}` : null
        ].filter(Boolean);
        navigator.clipboard.writeText(lines.join("\n\n"));
        toast.success("Copied finding to clipboard");
    };

    return (
        <Card className={finding.status === "dismissed" ? "opacity-60" : undefined}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={SEVERITY_VARIANT[finding.severity]} className="capitalize">
                            {finding.severity}
                        </Badge>
                        <Badge variant="outline">{TAG_LABELS[finding.tag]}</Badge>
                        {!isOpen && (
                            <Badge variant={finding.status === "resolved" ? "default" : "outline"} className="capitalize">
                                {finding.status}
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
                <p className="text-sm font-medium">{finding.title}</p>
                <p className="text-sm">{finding.description}</p>

                {finding.excerpt && (
                    <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">"{finding.excerpt}"</blockquote>
                )}

                {finding.direction && (
                    <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Direction: </span>
                        {finding.direction}
                    </p>
                )}

                <div className="flex gap-2 flex-wrap">
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
                    <Button size="sm" variant="ghost" onClick={copyMarkdown}>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                    </Button>
                    {onAddToScribble && (
                        <Button size="sm" variant="ghost" onClick={onAddToScribble} disabled={isAddingToScribble}>
                            {isAddingToScribble ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <NotebookPen className="h-4 w-4 mr-1" />
                            )}
                            Add to scribble
                        </Button>
                    )}
                    {onSendToEditorChat && (
                        <Button size="sm" variant="ghost" onClick={onSendToEditorChat}>
                            <MessageSquarePlus className="h-4 w-4 mr-1" />
                            Send to Editor chat
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
