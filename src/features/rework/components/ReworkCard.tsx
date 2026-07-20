import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { FocusPacket } from "@/types/rework";

interface ReworkCardProps {
    packet: FocusPacket;
    onClear: () => void;
}

const TRUNCATE_LENGTH = 160;
const truncate = (text: string) => (text.length > TRUNCATE_LENGTH ? `${text.slice(0, TRUNCATE_LENGTH)}…` : text);

// Host-agnostic preview shell for the Selection/Focus Rework Bridge
// (docs/Chat_Panel_Integrations_Design.md §3.3's "ReworkCard: UI shell: target preview, chips,
// link to host chat") — Editor's chapter-selection rework is its first caller. Shows the captured
// selection collapsed by default (so it doesn't dominate the chat panel across a long
// conversation), with an optional disclosure for the surrounding before/after context that was
// actually sent to the model.
export function ReworkCard({ packet, onClear }: ReworkCardProps) {
    const [showContext, setShowContext] = useState(false);

    return (
        <Card className="border-dashed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-2">
                <span className="text-sm font-medium">Reworking selection</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear} title="Clear rework">
                    <X className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-2">{truncate(packet.selection)}</p>

                <Collapsible open={showContext} onOpenChange={setShowContext}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1 text-xs text-muted-foreground">
                            {showContext ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {showContext ? "Hide" : "Show"} surrounding context
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2">
                        {packet.before && (
                            <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Before{packet.beforeTruncated ? " (truncated)" : ""}:</span>{" "}
                                {packet.before}
                            </div>
                        )}
                        {packet.after && (
                            <div className="text-xs text-muted-foreground">
                                <span className="font-medium">After{packet.afterTruncated ? " (truncated)" : ""}:</span>{" "}
                                {packet.after}
                            </div>
                        )}
                    </CollapsibleContent>
                </Collapsible>

                <p className="text-xs text-muted-foreground">
                    Talk through the change below — accepting the model's reply will replace only the highlighted
                    selection in the chapter.
                </p>
            </CardContent>
        </Card>
    );
}
