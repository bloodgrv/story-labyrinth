import advancedRaw from "../content/advanced.mdx?raw";
import aiReviewRaw from "../content/ai-review.mdx?raw";
import basicsRaw from "../content/basics.mdx?raw";
import brainstormRaw from "../content/brainstorm.mdx?raw";
import chatFeaturesRaw from "../content/chat-features.mdx?raw";
import concreteBeatsRaw from "../content/concrete-beats.mdx?raw";
import focusSessionsRaw from "../content/focus-sessions.mdx?raw";
import localSystemInjectRaw from "../content/local-system-inject.mdx?raw";
import locationsMapsRaw from "../content/locations-maps.mdx?raw";
import lorebookRaw from "../content/lorebook.mdx?raw";
import memoryRaw from "../content/memory.mdx?raw";
import multiviewRaw from "../content/multiview.mdx?raw";
import nameGeneratorRaw from "../content/name-generator.mdx?raw";
import notesRaw from "../content/notes.mdx?raw";
import outlineRaw from "../content/outline.mdx?raw";
import playbooksRaw from "../content/playbooks.mdx?raw";
import promptsRaw from "../content/prompts.mdx?raw";
import relationshipsRaw from "../content/relationships.mdx?raw";
import remoteAccessRaw from "../content/remote-access.mdx?raw";
import researchRaw from "../content/research.mdx?raw";
import settingsNavRaw from "../content/settings-nav.mdx?raw";
import storyTimelineRaw from "../content/story-timeline.mdx?raw";
import ttsRaw from "../content/tts.mdx?raw";
import { GUIDE_TOPIC_META, type GuideSearchSection, parseGuideSource } from "./guideSearchParser";

export type { GuideSearchSection } from "./guideSearchParser";

// Raw source per topic id, joined against the shared GUIDE_TOPIC_META (id + label) — this is the
// one piece guideSearchParser.ts can't own itself, since `?raw` is a Vite-only import convention
// (the server builds its own equivalent via fs.readFileSync in guideSearchService.ts).
const RAW_BY_TOPIC_ID: Record<string, string> = {
    basics: basicsRaw,
    "settings-nav": settingsNavRaw,
    "local-system-inject": localSystemInjectRaw,
    advanced: advancedRaw,
    lorebook: lorebookRaw,
    playbooks: playbooksRaw,
    "locations-maps": locationsMapsRaw,
    "story-timeline": storyTimelineRaw,
    "ai-review": aiReviewRaw,
    relationships: relationshipsRaw,
    "remote-access": remoteAccessRaw,
    memory: memoryRaw,
    prompts: promptsRaw,
    "chat-features": chatFeaturesRaw,
    research: researchRaw,
    notes: notesRaw,
    brainstorm: brainstormRaw,
    tts: ttsRaw,
    "concrete-beats": concreteBeatsRaw,
    "name-generator": nameGeneratorRaw,
    multiview: multiviewRaw,
    outline: outlineRaw,
    "focus-sessions": focusSessionsRaw
};

export const GUIDE_SEARCH_INDEX: GuideSearchSection[] = GUIDE_TOPIC_META.flatMap(topic =>
    parseGuideSource(RAW_BY_TOPIC_ID[topic.id], topic.id, topic.label)
);

interface GuideSearchResult extends GuideSearchSection {
    snippet: string;
}

const buildSnippet = (body: string, words: string[]): string => {
    if (!body) return "";
    const lower = body.toLowerCase();
    const firstIndex = words.map(w => lower.indexOf(w)).find(i => i >= 0);
    if (firstIndex === undefined) return body.slice(0, 120);
    const start = Math.max(0, firstIndex - 60);
    const end = Math.min(body.length, firstIndex + 60);
    return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
};

// Case-insensitive, all-query-words-must-appear-somewhere-in (heading + body) match — no fuzzy
// matching library needed at this content size (16 short files). Heading matches rank first.
// Tuned for short, deliberate search-box queries — see guideSearchService.ts's searchGuideForChat
// for the separate, more forgiving scorer used against full chat messages.
export function searchGuide(query: string, maxResults = 8): GuideSearchResult[] {
    const words = query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return [];

    const scored = GUIDE_SEARCH_INDEX.map(section => {
        const headingLower = section.heading.toLowerCase();
        const bodyLower = section.body.toLowerCase();
        const matchesAll = words.every(w => headingLower.includes(w) || bodyLower.includes(w));
        if (!matchesAll) return null;
        const headingScore = words.filter(w => headingLower.includes(w)).length;
        return { section, headingScore };
    }).filter((r): r is { section: GuideSearchSection; headingScore: number } => r !== null);

    scored.sort((a, b) => b.headingScore - a.headingScore);

    return scored.slice(0, maxResults).map(({ section }) => ({
        ...section,
        snippet: buildSnippet(section.body, words)
    }));
}
