import { AlertTriangle, ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RagScannerTool } from "@/components/workspace/tools/RagScannerTool";
import { UsersTool } from "@/components/workspace/tools/UsersTool";
import { WriterPrefsCard } from "@/features/agent-memory/components/WriterPrefsCard";
import { PlaybookPacksSettingsCard } from "@/features/playbooks/components/PlaybookPacksSettingsCard";
import { ArchivedChatsCard } from "@/features/ai/components/ArchivedChatsCard";
import { TrashCard } from "@/features/trash/components/TrashCard";
import { ContextMeterSettingsCard } from "@/features/ai/components/ContextMeterSettingsCard";
import { FeatureEndpointsCard } from "@/features/ai/components/FeatureEndpointsCard";
import { GrokOAuthCard } from "@/features/ai/components/GrokOAuthCard";
import { LocalModelsCard } from "@/features/ai/components/LocalModelsCard";
import { LocalSystemInjectCard } from "@/features/ai/components/LocalSystemInjectCard";
import { ProviderCard } from "@/features/ai/components/ProviderCard";
import { RecentJobsCard } from "@/features/ai/components/RecentJobsCard";
import {
    useAISettingsQuery,
    useDeleteDemoDataMutation,
    useDisconnectGrokOAuthMutation,
    useRefreshModelsMutation,
    useUpdateAPIKeyMutation,
    useUpdateDefaultModelMutation,
    useUpdateLocalApiUrlMutation,
    useUpdatePreferredModeMutation
} from "@/features/ai/hooks/useAISettingsQuery";
import { useIsOwner } from "@/features/auth/hooks/useCanEdit";
import { TransfersLogCard } from "@/features/transfers/components/TransfersLogCard";
import { GrammarSettingsCard } from "@/features/grammar/components/GrammarSettingsCard";
import { GuideTabs } from "@/features/guide/components/GuideTabs";
import { HumanizerSettingsCard } from "@/features/humanizer/components/HumanizerSettingsCard";
import { AutoHumanizerSettingsCard } from "@/features/auto-humanizer/components/AutoHumanizerSettingsCard";
import { useStoryContext } from "@/features/stories/context/StoryContext";
import { McpConnectionsSettingsCard } from "@/features/mcp/components/McpConnectionsSettingsCard";
import { McpServerExposeCard } from "@/features/mcp/components/McpServerExposeCard";
import { TtsSettingsCard } from "@/features/tts/components/TtsSettingsCard";
import type { ChatMode } from "@/types/story";

// Settings IA (S0, docs/Transfer_Log_And_Settings_IA_Design.md) — previously one long undifferentiated
// scroll; now sub-nav headings per the design doc's locked decision #5. Per-chat toggles (auto-shuttle,
// notes gates, etc.) deliberately stay on chat chrome, not here (design doc: "not Settings").
// Guide/Users/Scanner were left-sidebar workspace tools; moved here to declutter that rail — Users
// stays owner-gated (see isOwner below), Scanner reuses the same story-scoped panel and just asks
// for a story if none is selected yet.
const SECTIONS = [
    "appearance",
    "providers",
    "local",
    "routing",
    "writing",
    "integrations",
    "logs",
    "data",
    "trash",
    "guide",
    "scanner",
    "users"
] as const;
type Section = (typeof SECTIONS)[number];

export default function SettingsPage() {
    const navigate = useNavigate();
    const isOwner = useIsOwner();
    const { currentStoryId } = useStoryContext();
    const [localApiUrlInput, setLocalApiUrlInput] = useState("");
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    // Supports deep links like /settings?section=logs (e.g. the Activity Stoplight's "All jobs →"
    // footer link) — one-time initial value only, not kept in sync with the URL afterward.
    const [searchParams] = useSearchParams();
    const [section, setSection] = useState<Section>(() => {
        const requested = searchParams.get("section");
        return (SECTIONS as readonly string[]).includes(requested ?? "") ? (requested as Section) : "appearance";
    });

    const { data: settings, isLoading: isLoadingSettings } = useAISettingsQuery();

    const updateKeyMutation = useUpdateAPIKeyMutation();
    const updateLocalUrlMutation = useUpdateLocalApiUrlMutation();
    const updateDefaultModelMutation = useUpdateDefaultModelMutation();
    const refreshModelsMutation = useRefreshModelsMutation();
    const disconnectGrokOAuthMutation = useDisconnectGrokOAuthMutation();
    const deleteDemoMutation = useDeleteDemoDataMutation();
    const updatePreferredModeMutation = useUpdatePreferredModeMutation();

    if (isLoadingSettings)
        return (
            <div className="p-8 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );

    const allModels = settings?.availableModels || [];
    const openaiModels = allModels.filter(m => m.provider === "openai");
    const openrouterModels = allModels.filter(m => m.provider === "openrouter");
    const deepseekModels = allModels.filter(m => m.provider === "deepseek");
    const geminiModels = allModels.filter(m => m.provider === "gemini");
    const localModels = allModels.filter(m => m.provider === "local");
    const grokModels = allModels.filter(m => m.provider === "grok");
    const grokOAuthModels = allModels.filter(m => m.provider === "grok-oauth");

    const currentLocalUrl = localApiUrlInput || settings?.localApiUrl || "";

    return (
        <div className="p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center mb-8">
                    <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                    <div className="flex items-center gap-3 ml-4">
                        <BrandMark className="h-9" />
                        <h1 className="text-3xl font-bold">Settings</h1>
                    </div>
                </div>

                <Tabs value={section} onValueChange={value => setSection(value as Section)} orientation="vertical">
                    <div className="flex gap-8 items-start">
                        <TabsList className="flex-col h-auto w-48 shrink-0 items-stretch bg-transparent p-0 gap-1">
                            <TabsTrigger value="appearance" className="justify-start w-full data-[state=active]:bg-muted">
                                Appearance
                            </TabsTrigger>
                            <TabsTrigger value="providers" className="justify-start w-full data-[state=active]:bg-muted">
                                Providers &amp; keys
                            </TabsTrigger>
                            <TabsTrigger value="local" className="justify-start w-full data-[state=active]:bg-muted">
                                Local
                            </TabsTrigger>
                            <TabsTrigger value="routing" className="justify-start w-full data-[state=active]:bg-muted">
                                Feature routing
                            </TabsTrigger>
                            <TabsTrigger value="writing" className="justify-start w-full data-[state=active]:bg-muted">
                                Writing tools
                            </TabsTrigger>
                            {isOwner && (
                                <TabsTrigger value="integrations" className="justify-start w-full data-[state=active]:bg-muted">
                                    Integrations
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="logs" className="justify-start w-full data-[state=active]:bg-muted">
                                Logs
                            </TabsTrigger>
                            <TabsTrigger value="data" className="justify-start w-full data-[state=active]:bg-muted">
                                Data
                            </TabsTrigger>
                            <TabsTrigger value="trash" className="justify-start w-full data-[state=active]:bg-muted">
                                Trash
                            </TabsTrigger>
                            <TabsTrigger value="guide" className="justify-start w-full data-[state=active]:bg-muted">
                                Guide
                            </TabsTrigger>
                            <TabsTrigger value="scanner" className="justify-start w-full data-[state=active]:bg-muted">
                                Scanner
                            </TabsTrigger>
                            {isOwner && (
                                <TabsTrigger value="users" className="justify-start w-full data-[state=active]:bg-muted">
                                    Users
                                </TabsTrigger>
                            )}
                        </TabsList>

                        <div className="flex-1 min-w-0 space-y-6">
                            <TabsContent value="appearance" className="mt-0 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Theme</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ThemeToggle isExpanded />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="providers" className="mt-0 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Chat default routing</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex items-center gap-4">
                                        <Label className="text-sm font-normal text-muted-foreground">
                                            New chats default to
                                        </Label>
                                        <Tabs
                                            value={settings?.preferredMode ?? "cloud"}
                                            onValueChange={value => updatePreferredModeMutation.mutate(value as ChatMode)}
                                        >
                                            <TabsList>
                                                <TabsTrigger value="cloud">Cloud</TabsTrigger>
                                                <TabsTrigger value="local">Local</TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </CardContent>
                                </Card>

                                {/* First-Start Tour (T11, OT4) — a composite anchor on the first
                                    provider card is enough per the design's "whichever anchors
                                    exist; one composite highlight OK." Local's own URL field is
                                    an equally valid path, covered in the step's copy instead. */}
                                <div data-tour="settings-providers-panel">
                                <ProviderCard
                                    provider="openai"
                                    title="OpenAI Configuration"
                                    keyLabel="OpenAI API Key"
                                    keyPlaceholder="Enter your OpenAI API key"
                                    storedKey={settings?.openaiKey}
                                    models={openaiModels}
                                    defaultModel={settings?.defaultOpenAIModel}
                                    isKeyMutating={updateKeyMutation.isPending}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onSaveKey={key => updateKeyMutation.mutate({ provider: "openai", key })}
                                    onRefresh={() => refreshModelsMutation.mutate("openai")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "openai", modelId })}
                                />
                                </div>

                                <ProviderCard
                                    provider="openrouter"
                                    title="OpenRouter Configuration"
                                    keyLabel="OpenRouter API Key"
                                    keyPlaceholder="Enter your OpenRouter API key"
                                    storedKey={settings?.openrouterKey}
                                    models={openrouterModels}
                                    defaultModel={settings?.defaultOpenRouterModel}
                                    isKeyMutating={updateKeyMutation.isPending}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onSaveKey={key => updateKeyMutation.mutate({ provider: "openrouter", key })}
                                    onRefresh={() => refreshModelsMutation.mutate("openrouter")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "openrouter", modelId })}
                                />

                                <ProviderCard
                                    provider="deepseek"
                                    title="DeepSeek Configuration"
                                    keyLabel="DeepSeek API Key"
                                    keyPlaceholder="Enter your DeepSeek API key"
                                    storedKey={settings?.deepseekKey}
                                    models={deepseekModels}
                                    defaultModel={settings?.defaultDeepSeekModel}
                                    isKeyMutating={updateKeyMutation.isPending}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onSaveKey={key => updateKeyMutation.mutate({ provider: "deepseek", key })}
                                    onRefresh={() => refreshModelsMutation.mutate("deepseek")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "deepseek", modelId })}
                                />

                                <ProviderCard
                                    provider="gemini"
                                    title="Google Gemini Configuration"
                                    keyLabel="Gemini API Key"
                                    keyPlaceholder="Enter your Gemini API key"
                                    storedKey={settings?.geminiKey}
                                    models={geminiModels}
                                    defaultModel={settings?.defaultGeminiModel}
                                    isKeyMutating={updateKeyMutation.isPending}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onSaveKey={key => updateKeyMutation.mutate({ provider: "gemini", key })}
                                    onRefresh={() => refreshModelsMutation.mutate("gemini")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "gemini", modelId })}
                                />

                                <ProviderCard
                                    provider="grok"
                                    title="Grok (xAI) Configuration"
                                    keyLabel="xAI API Key"
                                    keyPlaceholder="Enter your xAI API key"
                                    storedKey={settings?.grokKey}
                                    models={grokModels}
                                    defaultModel={settings?.defaultGrokModel}
                                    isKeyMutating={updateKeyMutation.isPending}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onSaveKey={key => updateKeyMutation.mutate({ provider: "grok", key })}
                                    onRefresh={() => refreshModelsMutation.mutate("grok")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "grok", modelId })}
                                />

                                <GrokOAuthCard
                                    connected={!!settings?.grokOAuthAccessToken}
                                    defaultModel={settings?.defaultGrokOAuthModel}
                                    models={grokOAuthModels}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onRefresh={() => refreshModelsMutation.mutate("grok-oauth")}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "grok-oauth", modelId })}
                                    onDisconnect={() => disconnectGrokOAuthMutation.mutate()}
                                    isDisconnecting={disconnectGrokOAuthMutation.isPending}
                                />
                            </TabsContent>

                            <TabsContent value="local" className="mt-0 space-y-6">
                                <LocalModelsCard
                                    localModels={localModels}
                                    currentLocalUrl={currentLocalUrl}
                                    onLocalUrlChange={setLocalApiUrlInput}
                                    isSavingUrl={updateLocalUrlMutation.isPending}
                                    onSaveUrl={() => updateLocalUrlMutation.mutate(currentLocalUrl)}
                                    isRefreshing={refreshModelsMutation.isPending}
                                    onRefresh={() => refreshModelsMutation.mutate("local")}
                                    defaultModel={settings?.defaultLocalModel}
                                    onDefaultModelChange={modelId => updateDefaultModelMutation.mutate({ provider: "local", modelId })}
                                />
                                <ContextMeterSettingsCard />
                                <LocalSystemInjectCard />
                            </TabsContent>

                            <TabsContent value="routing" className="mt-0 space-y-6">
                                <FeatureEndpointsCard allModels={allModels} />
                            </TabsContent>

                            <TabsContent value="writing" className="mt-0 space-y-6">
                                <TtsSettingsCard />
                                <HumanizerSettingsCard />
                                <AutoHumanizerSettingsCard />
                                <GrammarSettingsCard />
                                <WriterPrefsCard />
                                <PlaybookPacksSettingsCard />
                            </TabsContent>

                            {isOwner && (
                                <TabsContent value="integrations" className="mt-0 space-y-6">
                                    <McpConnectionsSettingsCard storyId={currentStoryId ?? null} />
                                    <McpServerExposeCard />
                                </TabsContent>
                            )}

                            <TabsContent value="logs" className="mt-0 space-y-6">
                                <TransfersLogCard />
                                <RecentJobsCard />
                            </TabsContent>

                            <TabsContent value="data" className="mt-0 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Demo Data</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
                                            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0 mt-0.5" />
                                            <div className="text-sm text-red-800 dark:text-red-200">
                                                <p className="font-semibold mb-1">Warning</p>
                                                <p>
                                                    This will permanently delete all demo content including stories, chapters, and
                                                    lorebook entries marked as demo data.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Delete Demo Content</Label>
                                            <Button
                                                onClick={() => setShowDeleteDialog(true)}
                                                disabled={deleteDemoMutation.isPending}
                                                className="w-full"
                                                variant="destructive"
                                            >
                                                {deleteDemoMutation.isPending ? (
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                )}
                                                Delete All Demo Data
                                            </Button>
                                            <p className="text-xs text-muted-foreground">
                                                Remove the demo spy thriller story and all related content
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <ArchivedChatsCard />
                            </TabsContent>

                            <TabsContent value="trash" className="mt-0 space-y-6">
                                <TrashCard />
                            </TabsContent>

                            <TabsContent value="guide" className="mt-0">
                                <GuideTabs />
                            </TabsContent>

                            <TabsContent value="scanner" className="mt-0">
                                {currentStoryId ? (
                                    <RagScannerTool />
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Select a story to use the Scanner.
                                    </p>
                                )}
                            </TabsContent>

                            {isOwner && (
                                <TabsContent value="users" className="mt-0">
                                    <UsersTool />
                                </TabsContent>
                            )}
                        </div>
                    </div>
                </Tabs>
            </div>

            <ConfirmDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title="Delete Demo Data"
                description="This will permanently delete all demo content including stories, chapters, and lorebook entries. This action cannot be undone."
                onConfirm={() => deleteDemoMutation.mutate()}
                confirmLabel="Delete All"
            />
        </div>
    );
}
