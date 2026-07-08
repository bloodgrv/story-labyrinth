import type { GrammarCheckResult, GrammarConnectionTestResult, GrammarSettings } from "@/types/grammarSettings";
import { fetchJSON } from "./apiFactory";

export const grammarApi = {
    getSettings: () => fetchJSON<GrammarSettings>("/grammar/settings"),
    updateSettings: (id: string, data: Partial<GrammarSettings>) =>
        fetchJSON<GrammarSettings>(`/grammar/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    testConnection: (serverUrl: string) =>
        fetchJSON<GrammarConnectionTestResult>("/grammar/test-connection", {
            method: "POST",
            body: JSON.stringify({ serverUrl })
        }),
    check: (text: string) =>
        fetchJSON<GrammarCheckResult>("/grammar/check", { method: "POST", body: JSON.stringify({ text }) })
};
