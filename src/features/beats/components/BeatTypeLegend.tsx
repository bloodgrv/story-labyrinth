import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CONCRETE_BEAT_TYPES } from "@/types/beats";

/**
 * Reference for the colour each beat type renders as, both as a badge here and as the inline
 * editor highlight (PlaygroundEditorTheme.css's `.beat-mark--<type>` rules use the same 7 hues).
 * Exists so the mapping doesn't have to be memorized or reverse-engineered from the editor.
 */
export function BeatTypeLegend() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Beat type colour key">
                    <Info className="h-3.5 w-3.5" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="end">
                <p className="text-xs font-medium text-muted-foreground">Beat type colours</p>
                <div className="flex flex-col gap-1.5">
                    {CONCRETE_BEAT_TYPES.map(type => (
                        <div key={type.id} className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("font-normal", type.badgeClassName)}>
                                {type.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
