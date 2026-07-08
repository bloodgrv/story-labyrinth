import { BookOpen, FileText, Library, ListChecks, type LucideIcon, StickyNote, Tags, User } from "lucide-react";
import { useChapterQuery } from "@/features/chapters/hooks/useChaptersQuery";
import type { PaneTabContent } from "../types";

const TAB_ICONS: Record<PaneTabContent["kind"], LucideIcon> = {
    chapter: FileText,
    lorebook: Library,
    tags: Tags,
    outline: BookOpen,
    pov: User,
    notes: StickyNote,
    beats: ListChecks
};

const STATIC_LABELS: Partial<Record<PaneTabContent["kind"], string>> = {
    lorebook: "Lorebook",
    tags: "Tags",
    outline: "Outline",
    pov: "POV",
    notes: "Notes",
    beats: "Beats"
};

// Shared between docked tabs (PaneTabStrip) and floating panels (FloatingPanel) so a given
// PaneTabContent always looks the same wherever it's displayed.
export function useTabMeta(content: PaneTabContent): { icon: LucideIcon; label: string } {
    const chapterId = content.kind === "lorebook" ? "" : content.chapterId;
    const { data: chapter } = useChapterQuery(chapterId);
    const icon = TAB_ICONS[content.kind];

    if (content.kind === "chapter") return { icon, label: chapter?.title ?? "Chapter" };

    const base = STATIC_LABELS[content.kind] ?? content.kind;
    return { icon, label: chapter ? `${base} — ${chapter.title}` : base };
}
