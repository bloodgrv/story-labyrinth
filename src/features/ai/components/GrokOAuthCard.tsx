import { CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ModelCombobox } from "@/components/ui/model-combobox";
import { useGrokOAuthConnect } from "@/features/ai/hooks/useGrokOAuthConnect";
import type { AIModel } from "@/types/story";

type GrokOAuthCardProps = {
    connected: boolean;
    defaultModel: string | undefined;
    models: AIModel[];
    isRefreshing: boolean;
    onRefresh: () => void;
    onDefaultModelChange: (modelId: string | undefined) => void;
    onDisconnect: () => void;
    isDisconnecting: boolean;
};

export const GrokOAuthCard = ({
    connected,
    defaultModel,
    models,
    isRefreshing,
    onRefresh,
    onDefaultModelChange,
    onDisconnect,
    isDisconnecting
}: GrokOAuthCardProps) => {
    const { state, connect, cancel } = useGrokOAuthConnect();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    Grok (xAI OAuth) Configuration
                    {connected && (
                        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Models"}
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                    Connect your SuperGrok account via xAI's official OAuth login — uses the same
                    api.x.ai endpoint as a developer API key, no key needed.
                </p>

                {connected ? (
                    <>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
                            <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                                <CheckCircle2 className="h-4 w-4" />
                                Connected
                            </span>
                            <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={isDisconnecting}>
                                {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                            </Button>
                        </div>

                        {models.length > 0 && (
                            <div className="space-y-2">
                                <Label>Default Model</Label>
                                <ModelCombobox
                                    models={models}
                                    value={defaultModel}
                                    onValueChange={onDefaultModelChange}
                                    placeholder="Select default model"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Select a default model for Grok (xAI OAuth) generation
                                </p>
                            </div>
                        )}
                    </>
                ) : state.phase === "connecting" ? (
                    <div className="space-y-3 rounded-md border px-3 py-3">
                        <p className="text-sm">Click below to approve this connection on xAI's site:</p>
                        <Button asChild className="w-full">
                            <a href={state.verificationUriComplete} target="_blank" rel="noopener noreferrer">
                                Open xAI Login
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Confirmation code: <span className="font-mono font-semibold">{state.userCode}</span>
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Waiting for approval…
                            <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={cancel}>
                                <X className="h-3 w-3" />
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button onClick={connect}>Connect with xAI</Button>
                )}
            </CardContent>
        </Card>
    );
};
