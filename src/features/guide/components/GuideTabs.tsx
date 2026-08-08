import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuideProvider, mdxComponents } from "./mdx";
import AdvancedGuide from "../content/advanced.mdx";
import BasicsGuide from "../content/basics.mdx";
import BrainstormGuide from "../content/brainstorm.mdx";
import ChatFeaturesGuide from "../content/chat-features.mdx";
import ConcreteBeatsGuide from "../content/concrete-beats.mdx";
import FocusSessionsGuide from "../content/focus-sessions.mdx";
import LocationsMapsGuide from "../content/locations-maps.mdx";
import LorebookGuide from "../content/lorebook.mdx";
import MultiViewGuide from "../content/multiview.mdx";
import NameGeneratorGuide from "../content/name-generator.mdx";
import NotesGuide from "../content/notes.mdx";
import OutlineGuide from "../content/outline.mdx";
import PromptGuide from "../content/prompts.mdx";
import SettingsNavGuide from "../content/settings-nav.mdx";
import StoryTimelineGuide from "../content/story-timeline.mdx";
import TtsGuide from "../content/tts.mdx";

// Shared by the standalone /guide route (GuidePage.tsx) and the Settings "Guide" tab, so the
// guide topic tabs only need to be defined once.
export function GuideTabs() {
    const [activeTab, setActiveTab] = useState("basics");

    return (
        <Tabs defaultValue="basics" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap h-auto justify-start gap-1 mb-8">
                <TabsTrigger value="basics">Basics Guide</TabsTrigger>
                <TabsTrigger value="settings-nav">Settings & Navigation</TabsTrigger>
                <TabsTrigger value="advanced">Advanced Guide</TabsTrigger>
                <TabsTrigger value="lorebook">Lorebook Guide</TabsTrigger>
                <TabsTrigger value="locations-maps">Locations & Maps</TabsTrigger>
                <TabsTrigger value="story-timeline">Story Timeline</TabsTrigger>
                <TabsTrigger value="prompts">Prompt Guide</TabsTrigger>
                <TabsTrigger value="chat-features">Chat Features</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="brainstorm">Brainstorm Guide</TabsTrigger>
                <TabsTrigger value="tts">Text-to-Speech</TabsTrigger>
                <TabsTrigger value="concrete-beats">Concrete Beats</TabsTrigger>
                <TabsTrigger value="name-generator">Name Generator</TabsTrigger>
                <TabsTrigger value="multiview">MultiView</TabsTrigger>
                <TabsTrigger value="outline">Outline</TabsTrigger>
                <TabsTrigger value="focus-sessions">Writing Sessions</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-4">
                <GuideProvider>
                    <BasicsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="settings-nav" className="space-y-4">
                <GuideProvider>
                    <SettingsNavGuide components={mdxComponents} />
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

            <TabsContent value="locations-maps" className="space-y-4">
                <GuideProvider>
                    <LocationsMapsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="story-timeline" className="space-y-4">
                <GuideProvider>
                    <StoryTimelineGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="prompts" className="space-y-4">
                <GuideProvider>
                    <PromptGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="chat-features" className="space-y-4">
                <GuideProvider>
                    <ChatFeaturesGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
                <GuideProvider>
                    <NotesGuide components={mdxComponents} />
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

            <TabsContent value="name-generator" className="space-y-4">
                <GuideProvider>
                    <NameGeneratorGuide components={mdxComponents} />
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
