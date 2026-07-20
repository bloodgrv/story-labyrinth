import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BrainstormStyle = "light" | "standard" | "grill";

const STYLE_LABELS: Record<BrainstormStyle, string> = { light: "Light", standard: "Standard", grill: "Grill-me" };

// Opening lines sent into the composer (not auto-sent — user still hits Send) when "Guided
// setup" is clicked. Mirrors the depth each style's own system-prompt hint asks the model to
// bring (chatContextService.ts's STYLE_HINTS) — this button doesn't run any interview logic
// itself, it just starts the conversation in the right register (P0.4 B1/B2, confirmed
// prompt-driven, not a tracked state machine).
const OPENING_LINES: Record<BrainstormStyle, string> = {
    light: "Let's rough out my story idea — keep it quick, just the essentials.",
    standard: "Let's set up my project — walk me through the basics of premise, genre, characters, and setting.",
    grill: "Let's do a full guided setup — grill me on the details until we've got a solid premise, genre, protagonist, setting, and central conflict nailed down."
};

interface GuidedSetupControlProps {
    style: BrainstormStyle;
    onStyleChange: (style: BrainstormStyle) => void;
    onStartGuidedSetup: (openingLine: string) => void;
}

// Composer blurb + style dropdown + "Guided setup" button (P0.4 B1) — the entry UX §5 of
// docs/Chat_Panel_Integrations_Design.md locks for Brainstorm. Free chat always works without
// this; it's discoverability for the structured-interview path.
export function GuidedSetupControl({ style, onStyleChange, onStartGuidedSetup }: GuidedSetupControlProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                Start designing your project here — or run Guided setup for a structured interview.
            </p>
            <Select value={style} onValueChange={value => onStyleChange(value as BrainstormStyle)}>
                <SelectTrigger className="w-36">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(Object.keys(STYLE_LABELS) as BrainstormStyle[]).map(key => (
                        <SelectItem key={key} value={key}>
                            {STYLE_LABELS[key]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => onStartGuidedSetup(OPENING_LINES[style])} className="flex items-center gap-1">
                <Wand2 className="h-4 w-4" />
                Guided setup
            </Button>
        </div>
    );
}
