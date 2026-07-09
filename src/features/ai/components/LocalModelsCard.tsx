import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelCombobox } from "@/components/ui/model-combobox";
import { API_URLS } from "@/constants/urls";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/types/story";

interface LocalModelsCardProps {
    localModels: AIModel[];
    currentLocalUrl: string;
    onLocalUrlChange: (url: string) => void;
    isSavingUrl: boolean;
    onSaveUrl: () => void;
    isRefreshing: boolean;
    onRefresh: () => void;
    defaultModel: string | undefined;
    onDefaultModelChange: (modelId: string | undefined) => void;
}

// Extracted out of SettingsPage.tsx to keep that file under the project's max-lines limit.
// Owns its own "Advanced Settings" collapsible state — nothing else in SettingsPage used the
// generic openSections/toggleSection state this replaced, so that moved in here entirely too.
export function LocalModelsCard({
    localModels,
    currentLocalUrl,
    onLocalUrlChange,
    isSavingUrl,
    onSaveUrl,
    isRefreshing,
    onRefresh,
    defaultModel,
    onDefaultModelChange
}: LocalModelsCardProps) {
    const [advancedOpen, setAdvancedOpen] = useState(false);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    Local Models
                    <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Models"}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Models from LM Studio</span>
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ChevronRight className={cn("h-4 w-4 transition-transform", advancedOpen && "transform rotate-90")} />
                        Advanced Settings
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                        <div className="grid gap-2">
                            <Label htmlFor="local-api-url">Local API URL</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="local-api-url"
                                    type="text"
                                    placeholder={API_URLS.LOCAL_AI_DEFAULT}
                                    value={currentLocalUrl}
                                    onChange={e => onLocalUrlChange(e.target.value)}
                                />
                                <Button onClick={onSaveUrl} disabled={isSavingUrl || !currentLocalUrl.trim()}>
                                    {isSavingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                The URL of your local LLM server. Default is {API_URLS.LOCAL_AI_DEFAULT}
                            </p>
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {localModels.length > 0 && (
                    <div className="space-y-2">
                        <Label htmlFor="local-default">Default Model</Label>
                        <ModelCombobox
                            id="local-default"
                            models={localModels}
                            value={defaultModel}
                            onValueChange={onDefaultModelChange}
                            placeholder="Select default model"
                        />
                        <p className="text-xs text-muted-foreground">Select a default model for local generation</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
