import { attemptPromise } from "@jfdi/attempt";
import { API_URLS } from "@/constants/urls";
import { aiSettingsSchema } from "@/schemas/entities";
import type { AIModel, AIProvider, AISettings, ChatMode, PromptMessage } from "@/types/story";
import { logger } from "@/utils/logger";
import { aiApi } from "../api/client";
import { AIProviderFactory } from "./AIProviderFactory";
import { formatStreamAsSSE, processStreamedResponse, type StreamUsage } from "./streamUtils";

export class AIService {
    private static instance: AIService;
    private settings: AISettings | null = null;
    private readonly DEFAULT_LOCAL_API_URL = API_URLS.LOCAL_AI_DEFAULT;
    private providerFactory: AIProviderFactory;
    private abortController: AbortController | null = null;

    private constructor() {
        this.providerFactory = new AIProviderFactory(this.DEFAULT_LOCAL_API_URL);
    }

    static getInstance(): AIService {
        if (!AIService.instance) 
            AIService.instance = new AIService();
        
        return AIService.instance;
    }

    async initialize() {
        // Fetch settings from backend API
        const [error, settings] = await attemptPromise(() => aiApi.getSettings());

        if (error) {
            logger.error("[AIService] Failed to fetch settings from API", error);
            throw error;
        }

        this.settings = settings;

        // Initialize providers with stored keys
        if (this.settings.openaiKey)
            this.providerFactory.initializeProvider("openai", this.settings.openaiKey);

        if (this.settings.openrouterKey)
            this.providerFactory.initializeProvider("openrouter", this.settings.openrouterKey);

        if (this.settings.geminiKey)
            this.providerFactory.initializeProvider("gemini", this.settings.geminiKey);

        if (this.settings.grokKey)
            this.providerFactory.initializeProvider("grok", this.settings.grokKey);

        if (this.settings.grokSessionCookie)
            this.providerFactory.initializeProvider("grok-session", this.settings.grokSessionCookie);

        if (this.settings.grokOAuthAccessToken)
            this.providerFactory.initializeProvider("grok-oauth", this.settings.grokOAuthAccessToken);

        if (this.settings.localApiUrl)
            this.providerFactory.updateLocalApiUrl(this.settings.localApiUrl);

    }

    async updateKey(provider: AIProvider, key: string) {
        logger.info(`[AIService] Updating key for provider: ${provider}`);

        const keyFieldMap: Record<string, keyof AISettings> = {
            openai: "openaiKey",
            openrouter: "openrouterKey",
            gemini: "geminiKey",
            grok: "grokKey",
            "grok-session": "grokSessionCookie"
        };
        const field = keyFieldMap[provider];
        if (!field) return;

        await this.updateSettingsField({ [field]: key });
        this.providerFactory.initializeProvider(provider, key);
        await this.fetchAvailableModels(provider);
    }

    private async fetchAvailableModels(provider: AIProvider) {
        if (!this.settings) throw new Error("AIService not initialized");

        logger.info(`[AIService] Fetching available models for provider: ${provider}`);

        const aiProvider = this.providerFactory.getProvider(provider);
        const [error, models] = await attemptPromise(() => aiProvider.fetchModels());
        if (error) {
            logger.error("Error fetching models:", error);
            throw error;
        }

        logger.info(`[AIService] Fetched ${models.length} models for ${provider}`);

        const existingModels = this.settings.availableModels.filter(m => m.provider !== provider);
        const updatedModels = [...existingModels, ...models];

        await this.updateSettingsField({
            availableModels: updatedModels,
            lastModelsFetch: new Date()
        });
    }

    async getAvailableModels(provider?: AIProvider, forceRefresh: boolean = true): Promise<AIModel[]> {
        if (!this.settings) throw new Error("AIService not initialized");

        // Refresh settings from API to ensure we have latest data
        const [error, freshSettings] = await attemptPromise(() => aiApi.getSettings());
        if (!error && freshSettings) 
            this.settings = freshSettings;
        

        // Check if we should fetch fresh models
        if (provider && forceRefresh) 
            await this.fetchAvailableModels(provider);
        

        const result = provider
            ? this.settings.availableModels.filter(m => m.provider === provider)
            : this.settings.availableModels;

        return result;
    }

    async generate(
        providerType: AIProvider,
        messages: PromptMessage[],
        modelId: string,
        temperature: number = 1.0,
        maxTokens: number = 2048
    ): Promise<Response> {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // Local and grok-session already return an OpenAI-style SSE stream, so no re-wrapping needed
        if (providerType === "local" || providerType === "grok-session") {
            const provider = this.providerFactory.getProvider(providerType);
            return provider.generate(messages, modelId, temperature, maxTokens, signal);
        }

        // Ensure provider is initialized with API key
        this.ensureProviderInitialized(providerType);

        const provider = this.providerFactory.getProvider(providerType);
        const [error, response] = await attemptPromise(() =>
            provider.generate(messages, modelId, temperature, maxTokens, signal)
        );

        if (error) {
            if ((error as Error).name === "AbortError")
                return new Response(null, { status: 204 });
            throw error;
        }

        if (!response) throw new Error("No response from provider");
        return formatStreamAsSSE(response);
    }

    private ensureProviderInitialized(providerType: AIProvider): void {
        const provider = this.providerFactory.getProvider(providerType);
        if (provider.isInitialized()) return;

        const keyMap: Record<string, string | undefined> = {
            openai: this.settings?.openaiKey,
            openrouter: this.settings?.openrouterKey,
            gemini: this.settings?.geminiKey,
            grok: this.settings?.grokKey,
            "grok-session": this.settings?.grokSessionCookie,
            "grok-oauth": this.settings?.grokOAuthAccessToken
        };

        const key = keyMap[providerType];
        if (!key) throw new Error(`${providerType} API key not set`);
        this.providerFactory.initializeProvider(providerType, key);
    }

    async handleStreamedResponse(
        response: Response,
        onToken: (text: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void,
        onUsage?: (usage: StreamUsage) => void
    ) {
        await processStreamedResponse(response, onToken, onComplete, onError, onUsage);
        this.abortController = null;
    }

    // Getter methods
    getOpenAIKey(): string | undefined {
        return this.settings?.openaiKey;
    }

    getOpenRouterKey(): string | undefined {
        return this.settings?.openrouterKey;
    }

    getLocalApiUrl(): string {
        return this.settings?.localApiUrl || this.DEFAULT_LOCAL_API_URL;
    }

    getDefaultLocalModel(): string | undefined {
        return this.settings?.defaultLocalModel;
    }

    getDefaultOpenAIModel(): string | undefined {
        return this.settings?.defaultOpenAIModel;
    }

    getDefaultOpenRouterModel(): string | undefined {
        return this.settings?.defaultOpenRouterModel;
    }

    getGeminiKey(): string | undefined {
        return this.settings?.geminiKey;
    }

    getDefaultGeminiModel(): string | undefined {
        return this.settings?.defaultGeminiModel;
    }

    getGrokKey(): string | undefined {
        return this.settings?.grokKey;
    }

    getDefaultGrokModel(): string | undefined {
        return this.settings?.defaultGrokModel;
    }

    getDefaultGrokSessionModel(): string | undefined {
        return this.settings?.defaultGrokSessionModel;
    }

    getDefaultGrokOAuthModel(): string | undefined {
        return this.settings?.defaultGrokOAuthModel;
    }

    isGrokOAuthConnected(): boolean {
        return !!this.settings?.grokOAuthAccessToken;
    }

    async disconnectGrokOAuth(): Promise<void> {
        // "" / 0 rather than undefined — JSON.stringify drops undefined keys entirely, which
        // would leave the stored tokens untouched instead of clearing them.
        await this.updateSettingsField({
            grokOAuthAccessToken: "",
            grokOAuthRefreshToken: "",
            grokOAuthExpiresAt: 0
        });
        this.providerFactory.initializeProvider("grok-oauth", undefined);
    }

    async updateDefaultModel(provider: AIProvider, modelId: string | undefined): Promise<void> {
        if (!this.settings) throw new Error("AI settings not initialized");

        const fieldMap: Record<AIProvider, keyof AISettings> = {
            local: "defaultLocalModel",
            openai: "defaultOpenAIModel",
            openrouter: "defaultOpenRouterModel",
            gemini: "defaultGeminiModel",
            grok: "defaultGrokModel",
            "grok-session": "defaultGrokSessionModel",
            "grok-oauth": "defaultGrokOAuthModel"
        };
        const field = fieldMap[provider];
        if (!field) return;

        await this.updateSettingsField({ [field]: modelId });
    }

    private async updateSettingsField(updateData: Partial<AISettings>): Promise<void> {
        if (!this.settings) throw new Error("Settings not initialized");

        const result = aiSettingsSchema.partial().safeParse(updateData);
        if (!result.success)
            throw new Error(`Invalid AI settings update data: ${result.error.message}`);

        const settingsId = this.settings.id;
        const [error] = await attemptPromise(() => aiApi.updateSettings(settingsId, updateData));
        if (error) {
            logger.error("[AIService] Failed to update settings via API", error);
            throw error;
        }

        Object.assign(this.settings, updateData);
    }

    // Chat Model Routing (MR0) — sticky global Cloud|Local default for new/unset chat model
    // resolution (docs/Chat_Model_Routing_And_Chrome_Design.md, M1).
    async updatePreferredMode(mode: ChatMode): Promise<void> {
        await this.updateSettingsField({ preferredMode: mode });
    }

    async updateLocalApiUrl(url: string): Promise<void> {
        await this.updateSettingsField({ localApiUrl: url });
        this.providerFactory.updateLocalApiUrl(url);
        await this.fetchAvailableModels("local");
    }

    // Context/Token Meter (T4) — contextWindowOverride wins over whatever AIModel.contextLength
    // was fetched/guessed for the current default local model (design decision #5).
    async updateContextMeterSettings(data: {
        contextWindowOverride?: number | null;
        softWarnNearLimit?: boolean;
        softWarnThreshold?: number;
    }): Promise<void> {
        await this.updateSettingsField(data);
    }

    getSettings(): AISettings | null {
        return this.settings;
    }

    abortStream(): void {
        if (this.abortController) {
            logger.info("[AIService] Aborting stream");
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

export const aiService = AIService.getInstance();
