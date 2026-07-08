import type { AIModel, AIProvider, PromptMessage } from "@/types/story";
import type { IAIProvider } from "./IAIProvider";

// Unofficial provider driving a SuperGrok subscription via a pasted grok.com session cookie.
// Unlike every other provider, generation isn't called directly from the browser — the cookie
// is stored and used server-side (see server/routes/ai.ts POST /grok-session/generate) since
// browsers can't set a Cookie header on a cross-origin request. This class just proxies to our
// own backend, which already returns an OpenAI-style SSE stream, so no reformatting is needed.
export class GrokSessionProvider implements IAIProvider {
    private cookie: string | null = null;

    initialize(cookie?: string): void {
        this.cookie = cookie || null;
    }

    // grok.com's consumer product has no public model-listing endpoint. Its chat request takes
    // a "modeId" preset rather than a model name — these three are confirmed from grok.com's own
    // mode switcher UI.
    async fetchModels(): Promise<AIModel[]> {
        return [
            { id: "auto", name: "Auto (SuperGrok)", provider: "grok-session" as AIProvider, contextLength: 131072, enabled: true },
            { id: "fast", name: "Fast (SuperGrok)", provider: "grok-session" as AIProvider, contextLength: 131072, enabled: true },
            { id: "expert", name: "Expert (SuperGrok)", provider: "grok-session" as AIProvider, contextLength: 131072, enabled: true }
        ];
    }

    async generate(
        messages: PromptMessage[],
        model: string,
        temperature: number,
        maxTokens: number,
        signal?: AbortSignal
    ): Promise<Response> {
        return fetch("/api/ai/grok-session/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, model, temperature, maxTokens }),
            signal
        });
    }

    isInitialized(): boolean {
        return !!this.cookie;
    }
}
