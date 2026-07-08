import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GrammarMatch } from "@/types/grammarSettings";

const CATEGORY_LABEL: Record<GrammarMatch["category"], string> = {
    spelling: "Spelling",
    grammar: "Grammar",
    style: "Style"
};

const CATEGORY_BADGE_CLASS: Record<GrammarMatch["category"], string> = {
    spelling: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    grammar: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
};

interface GrammarIssuePopoverProps {
    match: GrammarMatch;
    rect: DOMRect;
    onApply: (replacement: string) => void;
    onIgnore: () => void;
    onClose: () => void;
}

// A one-shot popover anchored to a clicked grammar mark's viewport rect — deliberately simpler
// than the app's persistent floating toolbars (FloatingTextFormatToolbarPlugin etc.): it never
// needs to track the anchor moving (scrolling or editing elsewhere just closes it via the
// outside-click handler below), so plain `position: fixed` + the click-time rect is enough,
// no continuous reposition-on-scroll logic needed.
export function GrammarIssuePopover({ match, rect, onApply, onIgnore, onClose }: GrammarIssuePopoverProps) {
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
            className="fixed z-50 w-72 space-y-2 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ left: rect.left, top: rect.bottom + 6 }}
        >
            <Badge variant="outline" className={cn("font-normal", CATEGORY_BADGE_CLASS[match.category])}>
                {CATEGORY_LABEL[match.category]}
            </Badge>
            <p className="text-sm">{match.message}</p>
            {match.replacements.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {match.replacements.map(replacement => (
                        <Button
                            key={replacement}
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            onClick={() => onApply(replacement)}
                        >
                            {replacement}
                        </Button>
                    ))}
                </div>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={onIgnore}>
                Ignore
            </Button>
        </div>,
        document.body
    );
}
