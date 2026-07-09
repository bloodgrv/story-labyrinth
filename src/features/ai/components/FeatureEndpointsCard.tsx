import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModelCombobox } from "@/components/ui/model-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    useFeatureEndpointsQuery,
    useRemoveFeatureEndpointMutation,
    useSetFeatureEndpointMutation
} from "@/features/ai/hooks/useAISettingsQuery";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureEndpoint, type FeatureKey, type FeatureProvider } from "@/types/aiSettings";
import type { AIModel } from "@/types/story";

const PROVIDER_LABELS: Record<FeatureProvider, string> = {
    local: "Local",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    grok: "Grok (xAI)",
    "grok-oauth": "Grok (xAI OAuth)"
};

const PROVIDERS: FeatureProvider[] = ["local", "openai", "openrouter", "grok", "grok-oauth"];

interface FeatureEndpointRowProps {
    featureKey: FeatureKey;
    override: FeatureEndpoint | undefined;
    allModels: AIModel[];
    isSaving: boolean;
    onSave: (endpoint: FeatureEndpoint) => void;
    onClear: () => void;
}

// One row: provider select + (conditionally) a model picker, an apiUrl override for "local"
// specifically (the "run this feature on a different machine" case this whole system exists
// for), and a Save button. Local state so picking a provider doesn't save until confirmed.
function FeatureEndpointRow({ featureKey, override, allModels, isSaving, onSave, onClear }: FeatureEndpointRowProps) {
    const [provider, setProvider] = useState<FeatureProvider | "default">(override?.provider ?? "default");
    const [modelId, setModelId] = useState<string | undefined>(override?.model);
    const [apiUrl, setApiUrl] = useState(override?.apiUrl ?? "");

    // Re-sync if the override changes out from under us (e.g. cleared from elsewhere).
    useEffect(() => {
        setProvider(override?.provider ?? "default");
        setModelId(override?.model);
        setApiUrl(override?.apiUrl ?? "");
    }, [override]);

    const providerModels = provider === "default" ? [] : allModels.filter(m => m.provider === provider);
    const isDirty =
        provider !== (override?.provider ?? "default") || modelId !== override?.model || apiUrl !== (override?.apiUrl ?? "");

    const handleProviderChange = (value: string) => {
        const next = value as FeatureProvider | "default";
        setProvider(next);
        setModelId(undefined);
        if (next === "default" && override) onClear();
    };

    const handleSave = () => {
        if (provider === "default" || !modelId) return;
        onSave({
            provider,
            model: modelId,
            apiUrl: provider === "local" && apiUrl.trim() ? apiUrl.trim() : undefined
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-2 py-2">
            <span className="text-sm font-medium w-48 shrink-0">{FEATURE_LABELS[featureKey]}</span>
            <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-44">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="default">Global default</SelectItem>
                    {PROVIDERS.map(p => (
                        <SelectItem key={p} value={p}>
                            {PROVIDER_LABELS[p]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {provider !== "default" && (
                <>
                    {provider === "local" && (
                        <Input
                            value={apiUrl}
                            onChange={e => setApiUrl(e.target.value)}
                            placeholder="http://192.168.1.5:1234/v1 (optional)"
                            className="w-64"
                        />
                    )}
                    <ModelCombobox
                        models={providerModels}
                        value={modelId}
                        onValueChange={setModelId}
                        placeholder="Select model"
                        className="w-56"
                    />
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || !modelId || isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                </>
            )}
        </div>
    );
}

interface FeatureEndpointsCardProps {
    // Reuses SettingsPage.tsx's already-loaded model catalogue (useAISettingsQuery) rather than
    // fetching it again here.
    allModels: AIModel[];
}

// Per-feature AI endpoint editor — the missing piece of a system that was otherwise fully built
// (backend API, read-only dashboard display) but had no way to actually set an override through
// the app. Lets each feature (Document Import, RAG Scanner, etc.) point at a specific
// provider/model/machine independent of the global default in the provider cards above.
export function FeatureEndpointsCard({ allModels }: FeatureEndpointsCardProps) {
    const { data: featureEndpoints = {} } = useFeatureEndpointsQuery();
    const setMutation = useSetFeatureEndpointMutation();
    const removeMutation = useRemoveFeatureEndpointMutation();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feature Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                    Override the global default model for specific features — e.g. run the RAG Scanner on a different
                    machine, or point Document Import at a specific provider. Anything left on "Global default" uses
                    whichever provider above is configured first.
                </p>
                <div className="divide-y">
                    {FEATURE_KEYS.map(key => (
                        <FeatureEndpointRow
                            key={key}
                            featureKey={key}
                            override={featureEndpoints[key]}
                            allModels={allModels}
                            isSaving={setMutation.isPending}
                            onSave={endpoint => setMutation.mutate({ feature: key, endpoint })}
                            onClear={() => removeMutation.mutate(key)}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
