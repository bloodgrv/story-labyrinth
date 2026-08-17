import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentImportDraft } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import type { WorldBuildingSeed } from "@/types/worldbuilding";
import type { LorebookCategory } from "./form";

// The permanent first tab (card grid) plus one tab per entry opened from a card, plus one per
// pending document-import draft — a lightweight, page-local tab strip (not the Editor's
// MultiView pane/tab system, which Lorebook isn't part of; see DECISIONS.md's tab-location
// note). Visual language matches editor-multiview/components/PaneTabStrip.tsx, minus the
// split/float controls that don't apply here.
export type LorebookOpenTab =
    | { kind: "browse" }
    | { kind: "secrets" }
    // initialWorldBuildingSeed here only ever comes from a "new" tab's own seed being carried
    // across its draft->real-entry promotion (LorebookPage.tsx's onEntryCreated) — never set when
    // opening an already-existing entry the ordinary way (card click, cross-tool navigation).
    | { kind: "entry"; entryId: string; initialWorldBuildingSeed?: WorldBuildingSeed }
    | { kind: "draft"; draftId: string; draft: DocumentImportDraft }
    | {
          kind: "new";
          tabId: string;
          defaultCategory: LorebookCategory;
          draftValues?: DocumentImportDraft;
          initialWorldBuildingSeed?: WorldBuildingSeed;
      };

const tabKey = (tab: LorebookOpenTab) =>
    tab.kind === "browse"
        ? "browse"
        : tab.kind === "secrets"
          ? "secrets"
          : tab.kind === "entry"
            ? tab.entryId
            : tab.kind === "draft"
              ? tab.draftId
              : tab.tabId;

interface LorebookTabStripProps {
    tabs: LorebookOpenTab[];
    activeIndex: number;
    entries: LorebookEntry[];
    onSelect: (index: number) => void;
    onClose: (index: number) => void;
}

export function LorebookTabStrip({ tabs, activeIndex, entries, onSelect, onClose }: LorebookTabStripProps) {
    return (
        <div className="flex items-center gap-0.5 border-b bg-muted/20 px-2 py-1 shrink-0">
            <div role="tablist" className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto">
                {tabs.map((tab, index) => {
                    const isActive = index === activeIndex;
                    const label =
                        tab.kind === "browse"
                            ? "Browse"
                            : tab.kind === "secrets"
                              ? "Secrets"
                              : tab.kind === "entry"
                                ? (entries.find(e => e.id === tab.entryId)?.name ?? "Entry")
                                : tab.kind === "draft"
                                  ? tab.draft.name
                                  : "New Entry";
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
