import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LorebookEntry } from "@/types/story";

interface SexualityProfilePanelProps {
    entry: LorebookEntry;
}

// Exact sibling of PsychProfilePanel.tsx (docs/Sexuality_Playbook_Design.md) — read-only display
// of entry.metadata.sexualityProfile. No manual edit form — the only write path is chat
// propose→accept (ChatInterface.tsx's handleAcceptSexuality). Reads straight off the entry prop,
// no query of its own needed.
export function SexualityProfilePanel({ entry }: SexualityProfilePanelProps) {
    const [open, setOpen] = useState(true);
    const profile = entry.metadata?.sexualityProfile;
    if (!profile || (!profile.orientation && !profile.dynamic && !profile.kinks && !profile.limits && !profile.blurb))
        return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md p-2">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full justify-between p-2" type="button">
                    <span className="font-semibold">Sexuality</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2 px-2 pb-2">
                <p className="text-xs text-muted-foreground">
                    A writing aid derived from World-Building chat — not tracked Codex state, never enforced.
                </p>
                {(profile.orientation || profile.dynamic) && (
                    <div className="flex gap-4 text-sm flex-wrap">
                        {profile.orientation && (
                            <span>
                                <span className="font-medium">Orientation:</span> {profile.orientation}
                            </span>
                        )}
                        {profile.dynamic && (
                            <span>
                                <span className="font-medium">Dynamic:</span> {profile.dynamic}
                            </span>
                        )}
                    </div>
                )}
                {profile.kinks && (
                    <p className="text-sm">
                        <span className="font-medium">Kinks:</span> {profile.kinks}
                    </p>
                )}
                {profile.limits && (
                    <p className="text-sm">
                        <span className="font-medium">Limits:</span> {profile.limits}
                    </p>
                )}
                {profile.blurb && <p className="text-sm whitespace-pre-wrap">{profile.blurb}</p>}
            </CollapsibleContent>
        </Collapsible>
    );
}
