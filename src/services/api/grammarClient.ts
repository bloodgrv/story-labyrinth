import type { GrammarCheckResult, GrammarSettings } from "@/types/grammarSettings";
import { fetchJSON } from "./apiFactory";

export const grammarApi = {
    getSettings: () => fetchJSON<GrammarSettings>("/grammar/settings"),
    updateSettings: (id: string, data: Partial<GrammarSettings>) =>
        fetchJSON<GrammarSettings>(`/grammar/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    check: (text: string) =>
        fetchJSON<GrammarCheckResult>("/grammar/check", { method: "POST", body: JSON.stringify({ text }) })
};
