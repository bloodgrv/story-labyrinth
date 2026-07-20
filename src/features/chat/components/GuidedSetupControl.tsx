import { Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ChatStyle } from "@/types/worldbuilding";

const STYLE_LABELS: Record<ChatStyle, string> = { light: "Light", standard: "Standard", grill: "Grill-me" };

interface GuidedSetupControlProps {
    style: ChatStyle;
    onStyleChange: (style: ChatStyle) => void;
    // Host-specific composer blurb (Brainstorm/WB/Outline each read differently) — was hardcoded
    // Brainstorm-only text before P0.4 B5 generalized this component for WB/Outline reuse.
    blurb: string;
    // Caller computes the opening line for the chosen style and feeds it into whatever composer
    // it owns (e.g. via ChatInterface's initialComposerText) — this component has no opinion on
    // host-specific content, only the style/session-options UI shell (P0.4 B0-B5).
    onGuidedSetup: (style: ChatStyle) => void;
    // WB's Character template psych-module opt-in (P0.4 B5) — the only host that needs a second
    // toggle under Guided Setup today; omitted entirely for Brainstorm/Outline/non-Character WB.
    extraToggle?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
}

// Composer blurb + style dropdown + "Guided setup" button + optional extra toggle — the shared
// guided-start UX shell docs/Chat_Panel_Integrations_Design.md §1/§5 locks across Brainstorm, WB,
// and Outline (P0.4 B0-B5). Free chat always works without this; it's discoverability for the
// structured-interview path. Originally Brainstorm-only (B0-B4); generalized here (moved from
// features/brainstorm) once WB/Outline needed the identical shell with different blurb/opening-
// line/toggle content.
export function GuidedSetupControl({ style, onStyleChange, blurb, onGuidedSetup, extraToggle }: GuidedSetupControlProps) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">{blurb}</p>
            {extraToggle && (
                <div className="flex items-center gap-2">
                    <Switch id="guided-setup-extra-toggle" checked={extraToggle.checked} onCheckedChange={extraToggle.onChange} />
                    <Label htmlFor="guided-setup-extra-toggle" className="text-sm font-normal whitespace-nowrap">
                        {extraToggle.label}
                    </Label>
                </div>
            )}
            <Select value={style} onValueChange={value => onStyleChange(value as ChatStyle)}>
                <SelectTrigger className="w-36">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(Object.keys(STYLE_LABELS) as ChatStyle[]).map(key => (
                        <SelectItem key={key} value={key}>
                            {STYLE_LABELS[key]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => onGuidedSetup(style)} className="flex items-center gap-1">
                <Wand2 className="h-4 w-4" />
                Guided setup
            </Button>
        </div>
    );
}
