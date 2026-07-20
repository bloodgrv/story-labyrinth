import type { CodexPendingChange, CodexSnapshot, CodexSourceType, CodexState } from "@/types/codex";
import type { LorebookEntry } from "@/types/story";
import { fetchJSON } from "./apiFactory";

// Codex API (backed by /api/codex) — approve/reject a pending change, plus the direct
// enable/state-write path used by the manual Codex-state editor (LorebookEntryEditor.tsx).
// Proposing changes and listing them happens through chatsApi's chat-scoped codex-proposal
// calls (client.ts); these entry-level actions have no chat-scoped equivalent
// (server/routes/codex.ts). Split out of client.ts to keep that file under the project's
// max-lines limit, same reasoning as ttsClient.ts/humanizerClient.ts.
export const codexApi = {
    approve: (pendingChangeId: string) =>
        fetchJSON<{ entry: LorebookEntry | null; snapshot: unknown; pendingChange: CodexPendingChange }>(
            `/codex/pending/${pendingChangeId}/approve`,
            { method: "POST" }
        ),
    reject: (pendingChangeId: string) =>
        fetchJSON<{ pendingChange: CodexPendingChange }>(`/codex/pending/${pendingChangeId}/reject`, { method: "POST" }),
    enable: (entryId: string, data?: { sourceType?: CodexSourceType; sourceRef?: string }) =>
        fetchJSON<{ entry: LorebookEntry; snapshot: unknown }>(`/codex/${entryId}/enable`, {
            method: "POST",
            body: JSON.stringify(data ?? {})
        }),
    recordState: (
        entryId: string,
        data: {
            changes: Partial<{ description: string; codexState: CodexState; tags: string[]; needsFleshingOut: boolean }>;
            sourceType?: CodexSourceType;
            sourceRef?: string;
        }
    ) =>
        fetchJSON<{ entry: LorebookEntry; snapshot: unknown }>(`/codex/${entryId}/state`, {
            method: "POST",
            body: JSON.stringify(data)
        }),
    // C5 (docs/CURRENT_BACKLOG.md P0.3) — pending changes for this entry regardless of source
    // (chat OR suggest_codex_updates job); the chat-scoped proposals list (chatsApi.getProposals)
    // only ever surfaces sourceRef-prefixed "chat:{chatId}" rows, so job-sourced ("ai") proposals
    // need this entry-scoped list to ever become visible for approval.
    getPending: (entryId: string) => fetchJSON<CodexPendingChange[]>(`/codex/${entryId}/pending`),
    // Project Saves Phase 1 — snapshot history/timeline for a Codex entry.
    getSnapshots: (entryId: string) => fetchJSON<CodexSnapshot[]>(`/codex/${entryId}/snapshots`),
    restoreSnapshot: (entryId: string, snapshotId: string) =>
        fetchJSON<{ entry: LorebookEntry; snapshot: CodexSnapshot }>(`/codex/${entryId}/snapshots/${snapshotId}/restore`, {
            method: "POST"
        }),
    labelSnapshot: (entryId: string, snapshotId: string, label: string | null) =>
        fetchJSON<CodexSnapshot>(`/codex/${entryId}/snapshots/${snapshotId}`, {
            method: "PATCH",
            body: JSON.stringify({ label })
        })
};
