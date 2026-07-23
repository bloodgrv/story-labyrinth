import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuideProvider, mdxComponents } from "./mdx";
import AdvancedGuide from "../content/advanced.mdx";
import BasicsGuide from "../content/basics.mdx";
import BrainstormGuide from "../content/brainstorm.mdx";
import ConcreteBeatsGuide from "../content/concrete-beats.mdx";
import FocusSessionsGuide from "../content/focus-sessions.mdx";
import LorebookGuide from "../content/lorebook.mdx";
import MultiViewGuide from "../content/multiview.mdx";
import OutlineGuide from "../content/outline.mdx";
import PromptGuide from "../content/prompts.mdx";
import TtsGuide from "../content/tts.mdx";

// Shared by the standalone /guide route (GuidePage.tsx) and the Settings "Guide" tab, so the
// guide topic tabs only need to be defined once.
export function GuideTabs() {
    const [activeTab, setActiveTab] = useState("basics");

    return (
        <Tabs defaultValue="basics" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap h-auto justify-start gap-1 mb-8">
                <TabsTrigger value="basics">Basics Guide</TabsTrigger>
                <TabsTrigger value="advanced">Advanced Guide</TabsTrigger>
                <TabsTrigger value="lorebook">Lorebook Guide</TabsTrigger>
                <TabsTrigger value="prompts">Prompt Guide</TabsTrigger>
                <TabsTrigger value="brainstorm">Brainstorm Guide</TabsTrigger>
                <TabsTrigger value="tts">Text-to-Speech</TabsTrigger>
                <TabsTrigger value="concrete-beats">Concrete Beats</TabsTrigger>
                <TabsTrigger value="multiview">MultiView</TabsTrigger>
                <TabsTrigger value="outline">Outline</TabsTrigger>
                <TabsTrigger value="focus-sessions">Writing Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-4">
                <GuideProvider>
                    <BasicsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
                <GuideProvider>
                    <AdvancedGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="lorebook" className="space-y-4">
                <GuideProvider>
                    <LorebookGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="prompts" className="space-y-4">
                <GuideProvider>
                    <PromptGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="brainstorm" className="space-y-4">
                <GuideProvider>
                    <BrainstormGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="tts" className="space-y-4">
                <GuideProvider>
                    <TtsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="concrete-beats" className="space-y-4">
                <GuideProvider>
                    <ConcreteBeatsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="multiview" className="space-y-4">
                <GuideProvider>
                    <MultiViewGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="outline" className="space-y-4">
                <GuideProvider>
                    <OutlineGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="focus-sessions" className="space-y-4">
                <GuideProvider>
                    <FocusSessionsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>
        </Tabs>
    );
}
