import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type GuideSearchSection, searchGuide } from "../lib/guideSearchIndex";

interface GuideSearchProps {
    onSelectTopic: (topicId: string) => void;
}

// Waits (up to ~10 animation frames, matching the plan's rAF-poll approach) for a predicate to
// become true — used both while GuideTabs' TabsContent mounts after a topic switch, and while a
// nested sub-tab's own TabsContent mounts after its trigger is clicked.
function pollForFrame(predicate: () => boolean, onReady: () => void, framesLeft = 10) {
    if (predicate() || framesLeft <= 0) {
        onReady();
        return;
    }
    requestAnimationFrame(() => pollForFrame(predicate, onReady, framesLeft - 1));
}

export function GuideSearch({ onSelectTopic }: GuideSearchProps) {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(query), 150);
        return () => clearTimeout(timer);
    }, [query]);

    const results = debouncedQuery.trim() ? searchGuide(debouncedQuery) : [];

    const handleSelect = (section: GuideSearchSection) => {
        onSelectTopic(section.topicId);
        setQuery("");
        setDebouncedQuery("");
        setIsOpen(false);

        const scrollToHeading = () => {
            pollForFrame(
                () => document.getElementById(section.headingSlug) !== null,
                () => {
                    const el = document.getElementById(section.headingSlug);
                    if (!el) return;
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                    el.classList.add("guide-search-highlight");
                    setTimeout(() => el.classList.remove("guide-search-highlight"), 1500);
                }
            );
        };

        pollForFrame(
            () => true, // always waits at least one frame for the topic switch to mount
            () => {
                if (!section.subTabId) {
                    scrollToHeading();
                    return;
                }
                const trigger = document.querySelector<HTMLElement>(`[data-tab-value="${section.subTabId}"]`);
                trigger?.click();
                scrollToHeading();
            },
            1
        );
    };

    return (
        <div className="relative mb-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search the guide..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={e => {
                        if (e.key === "Escape") {
                            setQuery("");
                            setIsOpen(false);
                        }
                    }}
                    className="pl-8 pr-8"
                />
                {query && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-9 w-9"
                        onClick={() => {
                            setQuery("");
                            setIsOpen(false);
                        }}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {isOpen && debouncedQuery.trim() && (
                <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-md border bg-popover shadow-md">
                    {results.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground">No matches found.</div>
                    ) : (
                        results.map(result => (
                            <button
                                type="button"
                                key={`${result.topicId}-${result.subTabId ?? ""}-${result.headingSlug}`}
                                // onMouseDown (not onClick) fires before the input's onBlur, so the click
                                // registers before isOpen gets closed by any blur handler elsewhere.
                                onMouseDown={e => {
                                    e.preventDefault();
                                    handleSelect(result);
                                }}
                                className="block w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none border-b last:border-b-0"
                            >
                                <div className="text-xs text-muted-foreground">
                                    {result.topicLabel}
                                    {result.subTabLabel ? ` › ${result.subTabLabel}` : ""}
                                </div>
                                <div className="text-sm font-medium">{result.heading}</div>
                                {result.snippet && (
                                    <div className="text-xs text-muted-foreground line-clamp-1">{result.snippet}</div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
