import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTour } from "@/features/tour/context/TourContext";
import { GuideSearch } from "./GuideSearch";
import { GuideProvider, mdxComponents } from "./mdx";
import AdvancedGuide from "../content/advanced.mdx";
import AiReviewGuide from "../content/ai-review.mdx";
import BasicsGuide from "../content/basics.mdx";
import BrainstormGuide from "../content/brainstorm.mdx";
import ChatFeaturesGuide from "../content/chat-features.mdx";
import ConcreteBeatsGuide from "../content/concrete-beats.mdx";
import FocusSessionsGuide from "../content/focus-sessions.mdx";
import LocalSystemInjectGuide from "../content/local-system-inject.mdx";
import LocationsMapsGuide from "../content/locations-maps.mdx";
import LorebookGuide from "../content/lorebook.mdx";
import MemoryGuide from "../content/memory.mdx";
import MultiViewGuide from "../content/multiview.mdx";
import NameGeneratorGuide from "../content/name-generator.mdx";
import NotesGuide from "../content/notes.mdx";
import OutlineGuide from "../content/outline.mdx";
import PlaybooksGuide from "../content/playbooks.mdx";
import PromptGuide from "../content/prompts.mdx";
import RelationshipsGuide from "../content/relationships.mdx";
import ResearchGuide from "../content/research.mdx";
import SettingsNavGuide from "../content/settings-nav.mdx";
import StoryTimelineGuide from "../content/story-timeline.mdx";
import TtsGuide from "../content/tts.mdx";

// Shared by the standalone /guide route (GuidePage.tsx) and the Settings "Guide" tab, so the
// guide topic tabs only need to be defined once.
export function GuideTabs() {
    const [activeTab, setActiveTab] = useState("basics");
    const tour = useTour();

    return (
        <Tabs defaultValue="basics" value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* First-Start Tour (T11, OT6) — "top of Guide" per design §7's placement lock; one
                shared GuideTabs means one button covers both the standalone /guide route and the
                Settings "Guide" tab. Starting always runs the full spine from Welcome (design's
                own "prefer full spine from Welcome" lock) — it never re-arms auto-start (§4). */}
            <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" data-tour="guide-replay" onClick={() => tour.start()}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Replay tour
                </Button>
            </div>
            <GuideSearch onSelectTopic={setActiveTab} />
            <TabsList className="flex flex-wrap h-auto justify-start gap-1 mb-8">
                <TabsTrigger value="basics">Basics Guide</TabsTrigger>
                <TabsTrigger value="settings-nav">Settings & Navigation</TabsTrigger>
                <TabsTrigger value="local-system-inject">Local System Inject</TabsTrigger>
                <TabsTrigger value="advanced">Advanced Guide</TabsTrigger>
                <TabsTrigger value="lorebook">Lorebook Guide</TabsTrigger>
                <TabsTrigger value="playbooks">Playbook Packs</TabsTrigger>
                <TabsTrigger value="locations-maps">Locations & Maps</TabsTrigger>
                <TabsTrigger value="story-timeline">Story Timeline</TabsTrigger>
                <TabsTrigger value="ai-review">AI Review</TabsTrigger>
                <TabsTrigger value="relationships">Relationships</TabsTrigger>
                <TabsTrigger value="memory">Memory</TabsTrigger>
                <TabsTrigger value="prompts">Prompt Guide</TabsTrigger>
                <TabsTrigger value="chat-features">Chat Features</TabsTrigger>
                <TabsTrigger value="research">Research</TabsTrigger>
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

            <TabsContent value="local-system-inject" className="space-y-4">
                <GuideProvider>
                    <LocalSystemInjectGuide components={mdxComponents} />
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

            <TabsContent value="playbooks" className="space-y-4">
                <GuideProvider>
                    <PlaybooksGuide components={mdxComponents} />
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

            <TabsContent value="ai-review" className="space-y-4">
                <GuideProvider>
                    <AiReviewGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="relationships" className="space-y-4">
                <GuideProvider>
                    <RelationshipsGuide components={mdxComponents} />
                </GuideProvider>
            </TabsContent>

            <TabsContent value="memory" className="space-y-4">
                <GuideProvider>
                    <MemoryGuide components={mdxComponents} />
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

            <TabsContent value="research" className="space-y-4">
                <GuideProvider>
                    <ResearchGuide components={mdxComponents} />
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
