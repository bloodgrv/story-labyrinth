// Context/Token Meter (T4, docs/Context_Token_Meter_Design.md) — M1's "hybrid: char/heuristic
// while typing" measurement. Deliberately not a real tokenizer (non-goal #3, "perfect tokenizer
// coverage for every cloud model") — chars/4 is the design doc's own suggested heuristic, cheap
// enough to run on every keystroke. Refine-on-send (a real count) is out of scope for v1 — see
// DECISIONS.md's Context/Token Meter entry for why.
export const estimateTokens = (text: string): number => (text ? Math.ceil(text.length / 4) : 0);

// Shared by the chip/expand UI and the per-message usage badge.
export const formatTokenCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
