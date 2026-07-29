import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RagIssueSeverity, RagIssueStatus, RagIssueType, RagScanIssue } from "@/types/ragScan";

const SEVERITY_BADGE_CLASS: Record<RagIssueSeverity, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    medium: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    low: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
};

const ISSUE_TYPE_LABELS: Record<RagIssueType, string> = {
    contradiction: "Contradiction",
    state_mismatch: "State mismatch",
    timeline: "Timeline",
    other: "Other"
};

interface RagIssuePopoverProps {
    issue: RagScanIssue;
    rect: DOMRect;
    isUpdating: boolean;
    onUpdateStatus: (status: RagIssueStatus) => void;
    onClose: () => void;
}

// A one-shot popover anchored to a clicked RAG-issue mark's viewport rect — same shape as
// GrammarIssuePopover.tsx (position: fixed at click time, closes on outside click/scroll/Escape,
// no continuous reposition-on-scroll logic needed for a transient popover like this).
export function RagIssuePopover({ issue, rect, isUpdating, onUpdateStatus, onClose }: RagIssuePopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
        };
        const handleScroll = () => onClose();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        // Capture phase + a microtask delay so the click that OPENED the popover (still
        // bubbling at the moment this effect runs) doesn't immediately close it again.
        const timer = setTimeout(() => {
            document.addEventListener("pointerdown", handlePointerDown, true);
            document.addEventListener("scroll", handleScroll, true);
            document.addEventListener("keydown", handleKeyDown);
        }, 0);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("scroll", handleScroll, true);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={popoverRef}
            className="fixed z-50 w-80 space-y-2 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ left: rect.left, top: rect.bottom + 6 }}
        >
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("font-normal capitalize", SEVERITY_BADGE_CLASS[issue.severity])}>
                    {issue.severity}
                </Badge>
                <Badge variant="outline">{ISSUE_TYPE_LABELS[issue.issueType]}</Badge>
            </div>
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
                <Button size="sm" className="h-7 text-xs" disabled={isUpdating} onClick={() => onUpdateStatus("resolved")}>
                    {isUpdating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                    Resolve
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={isUpdating}
                    onClick={() => onUpdateStatus("dismissed")}
                >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Dismiss
                </Button>
            </div>
        </div>,
        document.body
    );
}
