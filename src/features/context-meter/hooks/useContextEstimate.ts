import { useMemo } from "react";
import type { ChatMessage } from "@/types/story";
import type { ChatContext } from "@/types/worldbuilding";
import { estimateTokens } from "../lib/estimateTokens";

export interface ContextSlice {
    label: string;
    tokens: number;
}

export interface ContextEstimate {
    slices: ContextSlice[];
    total: number;
    limit: number | null;
    pctUsed: number | null;
}

// Context/Token Meter (T4) — M1. Approximates the "full assembled prompt" (design decision #6)
// from the same ChatContext object the chat's own system-prompt-building effect already fetches
// (see ChatInterface.tsx's rawChatContext), rather than a second divergent prompt builder. This
// is an approximation, not a byte-for-byte replica of the final prompt string sent to the model
// (whitespace/formatting/section headers differ) — acceptable per the design doc's own "v1 may
// approximate from known packet string lengths if full dry-assemble is expensive" allowance.
export const useContextEstimate = (
    context: ChatContext | null,
    messages: ChatMessage[],
    draftText: string,
    limit: number | null,
    // Local System Inject (T12, design §7) — pass the active inject body only when it will
    // actually apply (enabled + provider === "local" + non-empty), same gating useGenerateWithPrompt
    // uses for the real send-path prepend. Kept as a separate slice rather than folded into
    // "System" so the meter can show it's the inject, not app framing, eating the budget.
    localInjectBody = ""
): ContextEstimate => {
    return useMemo(() => {
        const slice = (label: string, text: string): ContextSlice => ({ label, tokens: estimateTokens(text) });

        const slices: ContextSlice[] = context
            ? [
                  slice("System", context.systemPrompt),
                  slice("Local inject", localInjectBody),
                  slice(
                      "Lore",
                      [
                          ...context.relevantCodexEntries.map(e => e.excerpt),
                          ...context.relevantChapterPassages.map(p => p.excerpt)
                      ].join("\n")
                  ),
                  slice("Memory", context.relevantMemories.map(m => m.excerpt).join("\n")),
                  slice(
                      "Notes",
                      [
                          ...context.relevantNotes.map(n => n.excerpt),
                          ...context.allNotes.map(n => n.title),
                          context.focusedNote?.content ?? ""
                      ].join("\n")
                  ),
                  slice(
                      "Outline",
                      [
                          ...context.relevantOutlineItems.map(o => o.excerpt),
                          ...context.outlineTree.map(o => o.summary ?? ""),
                          ...context.writtenChapters.map(c => c.summary ?? ""),
                          ...context.chapterSummaries.map(c => c.summary ?? "")
                      ].join("\n")
                  ),
                  slice(
                      "Research",
                      [...context.webSearchResults.map(r => r.snippet), ...context.fetchedPages.map(p => p.text)].join("\n")
                  )
              ]
            : [];

        slices.push(slice("History", messages.map(m => m.content).join("\n")));
        slices.push(slice("Draft", draftText));

        const total = slices.reduce((sum, s) => sum + s.tokens, 0);
        const pctUsed = limit ? total / limit : null;

        return { slices: slices.filter(s => s.tokens > 0), total, limit, pctUsed };
    }, [context, messages, draftText, limit, localInjectBody]);
};
