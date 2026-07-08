import { ChevronDown, Lightbulb } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ThinkingBlockProps {
    thinking: string;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
    const [open, setOpen] = useState(false);

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Lightbulb className="h-3.5 w-3.5" />
                <span>Model thinking</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                {thinking}
            </CollapsibleContent>
        </Collapsible>
    );
}
