import { ExternalLink, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useShowModelThinking } from "@/lib/useShowModelThinking";
import { FEATURE_KEYS, FEATURE_LABELS } from "@/types/aiSettings";
import type { AISettings } from "@/types/story";
import type { FeatureEndpoints } from "@/types/aiSettings";

interface ConnectionStatus {
    label: string;
    configured: boolean;
    model?: string;
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 mt-0.5 ${active ? "bg-green-500" : "bg-muted-foreground/30"}`}
        />
    );
}

interface PreferencesSidebarProps {
    aiSettings: AISettings | undefined;
    featureEndpoints: FeatureEndpoints;
}

export function PreferencesSidebar({ aiSettings, featureEndpoints }: PreferencesSidebarProps) {
    const [showModelThinking, setShowModelThinking] = useShowModelThinking();

    const connections: ConnectionStatus[] = [
        {
            label: "Local (LM Studio / Ollama)",
            configured: !!aiSettings?.localApiUrl && !!aiSettings?.defaultLocalModel,
            model: aiSettings?.defaultLocalModel?.replace("local/", "") ?? undefined
        },
        {
            label: "OpenAI",
            configured: !!aiSettings?.openaiKey && !!aiSettings?.defaultOpenAIModel,
            model: aiSettings?.defaultOpenAIModel ?? undefined
        },
        {
            label: "OpenRouter",
            configured: !!aiSettings?.openrouterKey && !!aiSettings?.defaultOpenRouterModel,
            model: aiSettings?.defaultOpenRouterModel ?? undefined
        },
        {
            label: "Gemini",
            configured: !!aiSettings?.geminiKey && !!aiSettings?.defaultGeminiModel,
            model: aiSettings?.defaultGeminiModel ?? undefined
        },
        {
            label: "Grok (xAI)",
            configured: !!aiSettings?.grokKey && !!aiSettings?.defaultGrokModel,
            model: aiSettings?.defaultGrokModel ?? undefined
        },
        {
            label: "SuperGrok (Session)",
            configured: !!aiSettings?.grokSessionCookie && !!aiSettings?.defaultGrokSessionModel,
            model: aiSettings?.defaultGrokSessionModel ?? undefined
        },
        {
            label: "Grok (xAI OAuth)",
            configured: !!aiSettings?.grokOAuthAccessToken && !!aiSettings?.defaultGrokOAuthModel,
            model: aiSettings?.defaultGrokOAuthModel ?? undefined
        }
    ];

    const activeConnections = connections.filter(c => c.configured);
    const globalDefaultLabel = activeConnections[0]?.label ?? "None configured";

    const openSettings = () => window.open("/settings", "_blank", "noopener,noreferrer");

    return (
        <div className="space-y-4">
            {/* AI Connections */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">AI Connections</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-2">
                    {connections.map(conn => (
                        <div key={conn.label} className="flex items-start gap-2">
                            <StatusDot active={conn.configured} />
                            <div className="min-w-0">
                                <p className={`text-xs leading-tight ${conn.configured ? "text-foreground" : "text-muted-foreground"}`}>
                                    {conn.label}
                                </p>
                                {conn.configured && conn.model && (
                                    <p className="text-xs text-muted-foreground truncate">{conn.model}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {activeConnections.length === 0 && (
                        <p className="text-xs text-destructive">No AI provider configured</p>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={openSettings}
                    >
                        <Settings className="h-3 w-3 mr-1.5" />
                        Edit AI Settings
                        <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                    </Button>
                </CardContent>
            </Card>

            {/* Per-Feature Endpoints */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">Feature Endpoints</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Override the global model for specific features — e.g. run the scanner on a different machine.
                    </p>
                    <Separator />
                    {FEATURE_KEYS.map(key => {
                        const override = featureEndpoints[key];
                        return (
                            <div key={key} className="space-y-0.5">
                                <p className="text-xs font-medium">{FEATURE_LABELS[key]}</p>
                                <p className="text-xs text-muted-foreground">
                                    {override
                                        ? `${override.model} (${override.provider})`
                                        : `Global default · ${globalDefaultLabel}`}
                                </p>
                            </div>
                        );
                    })}
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-1 text-xs"
                        onClick={openSettings}
                    >
                        <Settings className="h-3 w-3 mr-1.5" />
                        Configure Endpoints
                        <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                    </Button>
                </CardContent>
            </Card>

            {/* Chat Display */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">Chat Display</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                    <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="show-model-thinking" className="text-xs font-normal">
                            Show Model Thinking
                        </Label>
                        <Switch
                            id="show-model-thinking"
                            checked={showModelThinking}
                            onCheckedChange={setShowModelThinking}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Reveal collapsible reasoning blocks from models that emit native thinking output.
                    </p>
                </CardContent>
            </Card>

            {/* Storage */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-semibold">Storage</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                    <p className="text-xs text-muted-foreground">
                        Local SQLite database. Configure backup locations and export settings in a future release.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
