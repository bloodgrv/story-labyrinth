import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { ModelCombobox } from "@/components/ui/model-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    useFeatureEndpointsQuery,
    useRebuildEmbeddingIndexMutation,
    useRemoveFeatureEndpointMutation,
    useSetAllFeatureEndpointsMutation,
    useSetFeatureEndpointMutation
} from "@/features/ai/hooks/useAISettingsQuery";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureEndpoint, type FeatureEndpoints, type FeatureKey, type FeatureProvider } from "@/types/aiSettings";
import type { AIModel } from "@/types/story";

const PROVIDER_LABELS: Record<FeatureProvider, string> = {
    local: "Local",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    grok: "Grok (xAI)",
    "grok-oauth": "Grok (xAI OAuth)",
    "local-inprocess": "Local (in-process)"
};

const PROVIDERS: FeatureProvider[] = ["local", "openai", "openrouter", "grok", "grok-oauth"];

// Runs entirely inside the Node server (server/services/localEmbeddingService.ts) — no HTTP
// endpoint, no live /models list to query, and only one supported model. Valid only for the
// "embedding" feature: it has no way to serve chat/scanner/etc. (see docs/Local_Embeddings_Design.md
// and the matching server-side check in routes/admin.ts).
const LOCAL_INPROCESS_MODEL_ID = "nomic-embed-text-v1.5 (local)";

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

    const availableProviders = featureKey === "embedding" ? [...PROVIDERS, "local-inprocess" as const] : PROVIDERS;
    const providerModels = provider === "default" ? [] : allModels.filter(m => m.provider === provider);
    const isDirty =
        provider !== (override?.provider ?? "default") || modelId !== override?.model || apiUrl !== (override?.apiUrl ?? "");

    const handleProviderChange = (value: string) => {
        const next = value as FeatureProvider | "default";
        setProvider(next);
        // Only one model is ever valid for local-inprocess — pre-fill it rather than making the
        // user pick from a combobox with nothing real to query.
        setModelId(next === "local-inprocess" ? LOCAL_INPROCESS_MODEL_ID : undefined);
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
                    {availableProviders.map(p => (
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
                    {provider === "local-inprocess" ? (
                        <span className="text-sm text-muted-foreground w-56">
                            {LOCAL_INPROCESS_MODEL_ID} — weights prefetched at build time, no endpoint needed
                        </span>
                    ) : (
                        <ModelCombobox
                            models={providerModels}
                            value={modelId}
                            onValueChange={setModelId}
                            placeholder="Select model"
                            className="w-56"
                        />
                    )}
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || !modelId || isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                </>
            )}
        </div>
    );
}

interface GlobalDefaultApplyRowProps {
    featureEndpoints: FeatureEndpoints;
    allModels: AIModel[];
    isSaving: boolean;
    onApply: (endpoints: FeatureEndpoints) => void;
}

// "Set global default" bulk picker — one provider/model choice, applied as an explicit
// per-feature override to every feature at once, rather than making someone open all 17 rows
// below and repeat the same Save click. Embeddings is deliberately excluded (never included in
// `applyTargets`, never touched by Apply): it's a different kind of feature — "local-inprocess"
// is a valid choice there and nowhere else, and its own row/model selection stays independent so
// a broad "switch everything" action can never accidentally clobber it. This does NOT change the
// underlying global-default *resolution* (aiClientFactory.ts's local -> openai -> openrouter ->
// grok -> grok-oauth priority chain, unaffected) — it just writes the same explicit override
// FeatureEndpointRow's own Save button would, to every applicable feature in one request.
function GlobalDefaultApplyRow({ featureEndpoints, allModels, isSaving, onApply }: GlobalDefaultApplyRowProps) {
    const [provider, setProvider] = useState<FeatureProvider>("local");
    const [modelId, setModelId] = useState<string | undefined>(undefined);
    const [apiUrl, setApiUrl] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);

    const providerModels = allModels.filter(m => m.provider === provider);

    const handleProviderChange = (value: string) => {
        setProvider(value as FeatureProvider);
        setModelId(undefined);
    };

    const applyTargets = FEATURE_KEYS.filter(key => key !== "embedding");

    const handleConfirm = () => {
        if (!modelId) return;
        const endpoint: FeatureEndpoint = {
            provider,
            model: modelId,
            apiUrl: provider === "local" && apiUrl.trim() ? apiUrl.trim() : undefined
        };
        const next: FeatureEndpoints = { ...featureEndpoints };
        for (const key of applyTargets) next[key] = endpoint;
        onApply(next);
        setConfirmOpen(false);
    };

    return (
        <div className="mb-4 pb-4 border-b">
            <p className="text-sm font-medium mb-2">Set global default</p>
            <p className="text-sm text-muted-foreground mb-3">
                Pick a provider and model, then apply it to every feature below at once — except Embeddings, which
                keeps its own separate setting (it's the only feature "Local (in-process)" is valid for).{" "}
                <span className="text-amber-600 dark:text-amber-500">
                    This also overwrites Image Generation — since a text/chat model can't generate images, you'll
                    need to go back and set that one row to an actual image model afterward.
                </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <Select value={provider} onValueChange={handleProviderChange}>
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PROVIDERS.map(p => (
                            <SelectItem key={p} value={p}>
                                {PROVIDER_LABELS[p]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
                <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!modelId || isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to all features"}
                </Button>
            </div>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Apply to all features?"
                description={`Sets every feature except Embeddings to ${PROVIDER_LABELS[provider]} / ${modelId ?? ""}, overwriting any per-feature overrides currently configured below. This includes Image Generation — remember to set that row back to a real image model afterward, since ${modelId ?? "this model"} can't generate images.`}
                confirmLabel="Apply"
                onConfirm={handleConfirm}
            />
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
    const setAllMutation = useSetAllFeatureEndpointsMutation();
    const removeMutation = useRemoveFeatureEndpointMutation();
    const rebuildMutation = useRebuildEmbeddingIndexMutation();
    const [confirmRebuildOpen, setConfirmRebuildOpen] = useState(false);

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

                <GlobalDefaultApplyRow
                    featureEndpoints={featureEndpoints}
                    allModels={allModels}
                    isSaving={setAllMutation.isPending}
                    onApply={endpoints => setAllMutation.mutate(endpoints)}
                />

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

                <div className="mt-4 pt-4 border-t flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                        Switched the Embeddings provider? Existing chunks keep their old model's vectors until
                        reindexed — mixing embedding spaces in search silently degrades relevance.
                    </p>
                    <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => setConfirmRebuildOpen(true)}
                        disabled={rebuildMutation.isPending}
                    >
                        {rebuildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rebuild embedding index"}
                    </Button>
                </div>

                <ConfirmDialog
                    open={confirmRebuildOpen}
                    onOpenChange={setConfirmRebuildOpen}
                    title="Rebuild embedding index for every story?"
                    description="Re-embeds every lorebook entry, chapter, memory, note, and outline item across every
                        story whose embedding doesn't match the currently configured model/provider. Search relevance
                        may be degraded until it finishes. Runs in the background — check Settings → Logs → Recent
                        Jobs for progress."
                    confirmLabel="Rebuild"
                    onConfirm={() => rebuildMutation.mutate()}
                />
            </CardContent>
        </Card>
    );
}
