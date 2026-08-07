import type { TimelinePin } from "@/types/storyTimeline";
import { groupPinsByTier, sortPins } from "../lib/sortPins";
import { whenLabel } from "./PinCard";

const tierStripLabel = { civil: "Dated", relative: "Since start", fuzzy: "Unordered" };

interface TimelineOverviewStripProps {
    pins: TimelinePin[];
}

// Story Timeline (T6, TL9, docs/Story_Timeline_Design.md) — "era/overview strip". No new "era"
// entity/schema (out of proportion for a polish-tier slice, see DECISIONS.md) — a compact
// condensed mini-view of the active timeline's pins, grouped by the same three sort tiers the
// main board already uses, with tier-boundary labels. Clicking a tick scrolls the matching
// PinCard into view via its data-pin-id attribute (PinCard.tsx). Always reflects all pins for the
// active timeline regardless of swimlanes — a lanes-aware strip would add complexity this
// overview aid doesn't need.
export function TimelineOverviewStrip({ pins }: TimelineOverviewStripProps) {
    if (pins.length === 0) return null;

    const groups = groupPinsByTier(sortPins(pins));

    const handleTickClick = (pinId: string) => {
        const el = document.querySelector<HTMLElement>(`[data-pin-id="${pinId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    };

    return (
        <div className="flex items-center gap-3 overflow-x-auto border rounded-md px-3 py-2 bg-muted/30 text-xs">
            {groups.map((group, i) => (
                <div key={`${group.tier}-${i}`} className="flex items-center gap-1.5 shrink-0">
                    {i > 0 && <div className="w-px h-4 bg-border shrink-0" />}
                    <span className="text-muted-foreground font-medium shrink-0">{tierStripLabel[group.tier]}</span>
                    <div className="flex items-center gap-1">
                        {group.pins.map(pin => (
                            <button
                                key={pin.id}
                                type="button"
                                title={`${pin.title} (${whenLabel(pin)})`}
                                onClick={() => handleTickClick(pin.id)}
                                className="h-2.5 w-2.5 rounded-full bg-primary/60 hover:bg-primary shrink-0 transition-colors"
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
