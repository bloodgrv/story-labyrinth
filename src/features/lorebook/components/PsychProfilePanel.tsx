import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LorebookEntry } from "@/types/story";

interface PsychProfilePanelProps {
    entry: LorebookEntry;
}

// P0.4 B5 — read-only display of the Character template's opt-in psych module
// (entry.metadata.psychProfile: MBTI/Enneagram/blurb). No manual edit form this pass — the only
// write path is chat propose→accept (ChatInterface.tsx's handleAcceptPsych), matching the design
// doc's "derived from interview answers, not cold-assigned" framing. Same panel-shell pattern as
// CodexPendingChangesPanel.tsx (Collapsible, bordered), rendered alongside it in
// LorebookEntryEditor.tsx but reading straight off the entry prop — no query of its own needed.
export function PsychProfilePanel({ entry }: PsychProfilePanelProps) {
    const [open, setOpen] = useState(true);
    const profile = entry.metadata?.psychProfile;
    if (!profile || (!profile.mbti && !profile.enneagram && !profile.blurb)) return null;

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md p-2">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex w-full justify-between p-2" type="button">
                    <span className="font-semibold">Psychology</span>
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2 px-2 pb-2">
                <p className="text-xs text-muted-foreground">
                    A writing aid derived from World-Building chat — not tracked Codex state, never enforced.
                </p>
                {(profile.mbti || profile.enneagram) && (
                    <div className="flex gap-4 text-sm">
                        {profile.mbti && (
                            <span>
                                <span className="font-medium">MBTI:</span> {profile.mbti}
                            </span>
                        )}
                        {profile.enneagram && (
                            <span>
                                <span className="font-medium">Enneagram:</span> {profile.enneagram}
                            </span>
                        )}
                    </div>
                )}
                {profile.blurb && <p className="text-sm whitespace-pre-wrap">{profile.blurb}</p>}
            </CollapsibleContent>
        </Collapsible>
    );
}
