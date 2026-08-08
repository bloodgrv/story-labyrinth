import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note } from "@/types/story";

// Sticky Browse tab + closable note tabs (T7, docs/Notes_Org_Browse_Design.md NO1) — same shape
// as LorebookTabStrip.tsx, duplicated (not imported) since it's typed to Lorebook's own tab union.
export type NoteOpenTab = { kind: "browse" } | { kind: "note"; noteId: string };

const tabKey = (tab: NoteOpenTab) => (tab.kind === "browse" ? "browse" : tab.noteId);

interface NotesTabStripProps {
    tabs: NoteOpenTab[];
    activeIndex: number;
    notes: Note[];
    onSelect: (index: number) => void;
    onClose: (index: number) => void;
}

export function NotesTabStrip({ tabs, activeIndex, notes, onSelect, onClose }: NotesTabStripProps) {
    return (
        <div className="flex items-center gap-0.5 border-b bg-muted/20 px-2 py-1 shrink-0">
            <div role="tablist" className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto">
                {tabs.map((tab, index) => {
                    const isActive = index === activeIndex;
                    const label = tab.kind === "browse" ? "Browse" : (notes.find(n => n.id === tab.noteId)?.title ?? "Note");
                    return (
                        <div
                            key={tabKey(tab)}
                            role="tab"
                            tabIndex={0}
                            aria-selected={isActive}
                            onClick={() => onSelect(index)}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelect(index);
                                }
                            }}
                            className={cn(
                                "group flex shrink-0 items-center gap-1.5 rounded-t-sm border-b-2 px-3 py-1.5 text-sm cursor-pointer max-w-[180px] transition-colors",
                                isActive
                                    ? "bg-background border-b-primary font-medium"
                                    : "border-b-transparent text-muted-foreground hover:bg-background/60"
                            )}
                            title={label}
                        >
                            <span className="truncate">{label}</span>
                            {tab.kind !== "browse" && (
                                <button
                                    type="button"
                                    className={cn(
                                        "hidden shrink-0 rounded p-0.5 hover:bg-muted group-hover:block",
                                        isActive && "block"
                                    )}
                                    title="Close tab"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onClose(index);
                                    }}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
