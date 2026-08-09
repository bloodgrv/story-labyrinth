import type { CodexCustomField, CodexStateItem } from "@/types/codex";

// T5 FS8 (docs/Lore_Sheet_And_Sync_Design.md §6e: "List buckets... full replace with diff shown")
// — shared by both Codex-proposal review surfaces (CodexPendingChangesPanel.tsx for Sync/
// auto-compile proposals, ProposalTrayCard.tsx for chat-emitted codex-proposal fences), so a
// proposal reads the same way regardless of which surface it happens to land on.

// Wardrobe/wounds/items are plain flat lists, full-replaced by a proposal (6e) — diffed by value
// (case/whitespace-insensitive, matching how sheetSyncService.ts's own mergeLabeledFields/
// parseStringList already normalize) rather than by id, since a proposal's items never carry the
// current entry's own ids.
export const diffCodexList = (current: CodexStateItem[] | undefined, proposed: CodexStateItem[] | undefined) => {
    const norm = (v: string) => v.trim().toLowerCase();
    const currentValues = (current ?? []).map(i => i.value.trim());
    const proposedValues = (proposed ?? []).map(i => i.value.trim());
    const currentSet = new Set(currentValues.map(norm));
    const proposedSet = new Set(proposedValues.map(norm));
    return {
        kept: proposedValues.filter(v => currentSet.has(norm(v))),
        added: proposedValues.filter(v => !currentSet.has(norm(v))),
        removed: currentValues.filter(v => !proposedSet.has(norm(v)))
    };
};

// Appearance/customFields are labeled fields, merge-by-key (6e) rather than full-replace — no
// "removed" case (a merge never drops an existing label), but "before → after" is still worth
// showing whenever a proposed label already exists with a different value, and "(new)" when it
// doesn't exist yet — mirrors sheetSyncService.ts's own mergeLabeledFields matching logic.
export const diffCodexFields = (current: CodexCustomField[] | undefined, proposed: CodexCustomField[] | undefined) => {
    const currentByLabel = new Map((current ?? []).map(f => [f.label.trim().toLowerCase(), f.value]));
    return (proposed ?? []).map(f => {
        const before = currentByLabel.get(f.label.trim().toLowerCase()) ?? null;
        return { label: f.label, before, after: f.value, changed: before !== null && before !== f.value };
    });
};

export function CodexListDiffLine({
    label,
    current,
    proposed
}: {
    label: string;
    current: CodexStateItem[] | undefined;
    proposed: CodexStateItem[] | undefined;
}) {
    if (!proposed?.length) return null;
    const { kept, added, removed } = diffCodexList(current, proposed);
    return (
        <p>
            {label}:{" "}
            {kept.map(v => (
                <span key={`k-${v}`} className="mr-1">
                    {v}
                </span>
            ))}
            {added.map(v => (
                <span key={`a-${v}`} className="mr-1 text-emerald-600 dark:text-emerald-400">
                    +{v}
                </span>
            ))}
            {removed.map(v => (
                <span key={`r-${v}`} className="mr-1 text-destructive line-through">
                    {v}
                </span>
            ))}
        </p>
    );
}

export function CodexFieldDiffLine({
    label,
    current,
    proposed
}: {
    label: string;
    current: CodexCustomField[] | undefined;
    proposed: CodexCustomField[] | undefined;
}) {
    if (!proposed?.length) return null;
    const diffs = diffCodexFields(current, proposed);
    return (
        <p>
            {label}:{" "}
            {diffs.map((d, i) => (
                <span key={`${d.label}-${i}`} className="mr-2">
                    {d.label}:{" "}
                    {d.before === null ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{d.after} (new)</span>
                    ) : d.changed ? (
                        <>
                            <span className="text-destructive line-through">{d.before}</span> → {d.after}
                        </>
                    ) : (
                        d.after
                    )}
                </span>
            ))}
        </p>
    );
}
