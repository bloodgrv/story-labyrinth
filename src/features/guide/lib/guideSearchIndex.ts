import GithubSlugger from "github-slugger";
import advancedRaw from "../content/advanced.mdx?raw";
import basicsRaw from "../content/basics.mdx?raw";
import brainstormRaw from "../content/brainstorm.mdx?raw";
import chatFeaturesRaw from "../content/chat-features.mdx?raw";
import concreteBeatsRaw from "../content/concrete-beats.mdx?raw";
import focusSessionsRaw from "../content/focus-sessions.mdx?raw";
import locationsMapsRaw from "../content/locations-maps.mdx?raw";
import lorebookRaw from "../content/lorebook.mdx?raw";
import multiviewRaw from "../content/multiview.mdx?raw";
import nameGeneratorRaw from "../content/name-generator.mdx?raw";
import notesRaw from "../content/notes.mdx?raw";
import outlineRaw from "../content/outline.mdx?raw";
import promptsRaw from "../content/prompts.mdx?raw";
import settingsNavRaw from "../content/settings-nav.mdx?raw";
import storyTimelineRaw from "../content/story-timeline.mdx?raw";
import ttsRaw from "../content/tts.mdx?raw";

export interface GuideSearchSection {
    topicId: string;
    topicLabel: string;
    subTabId?: string;
    subTabLabel?: string;
    heading: string;
    headingSlug: string;
    body: string;
}

// Mirrors GuideTabs.tsx's tab list (id + label) — kept as a separate source of truth here rather
// than importing from GuideTabs.tsx, since that file imports the compiled MDX components while
// this one needs their raw source text instead.
const GUIDE_TOPICS: { id: string; label: string; raw: string }[] = [
    { id: "basics", label: "Basics Guide", raw: basicsRaw },
    { id: "settings-nav", label: "Settings & Navigation", raw: settingsNavRaw },
    { id: "advanced", label: "Advanced Guide", raw: advancedRaw },
    { id: "lorebook", label: "Lorebook Guide", raw: lorebookRaw },
    { id: "locations-maps", label: "Locations & Maps", raw: locationsMapsRaw },
    { id: "story-timeline", label: "Story Timeline", raw: storyTimelineRaw },
    { id: "prompts", label: "Prompt Guide", raw: promptsRaw },
    { id: "chat-features", label: "Chat Features", raw: chatFeaturesRaw },
    { id: "notes", label: "Notes", raw: notesRaw },
    { id: "brainstorm", label: "Brainstorm Guide", raw: brainstormRaw },
    { id: "tts", label: "Text-to-Speech", raw: ttsRaw },
    { id: "concrete-beats", label: "Concrete Beats", raw: concreteBeatsRaw },
    { id: "name-generator", label: "Name Generator", raw: nameGeneratorRaw },
    { id: "multiview", label: "MultiView", raw: multiviewRaw },
    { id: "outline", label: "Outline", raw: outlineRaw },
    { id: "focus-sessions", label: "Writing Sessions", raw: focusSessionsRaw }
];

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const TABS_TRIGGER_RE = /<TabsTrigger\s+value="([^"]+)"[^>]*>([^<]*)<\/TabsTrigger>/g;
const TABS_CONTENT_OPEN_RE = /^<TabsContent\s+value="([^"]+)"/;

// Strip inline markdown formatting so both the displayed heading text and the slug we compute
// match what rehype-slug actually sees (the heading's rendered plain text, not its raw markdown
// source) — see vite.config.ts's rehypeSlug addition.
const stripMarkdownInline = (text: string): string =>
    text
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .trim();

// Plain-text parser over an .mdx file's raw SOURCE (never compiled/evaluated as MDX — so it
// can't reintroduce the "{number}" class of crash fixed this session). Only recognizes the exact
// JSX shapes these guide files actually use: a top-level `import ... from "...";` line, and at
// most one level of `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>` nesting (advanced,
// lorebook, prompts). Any other line starting with `<` is skipped as JSX chrome.
function parseGuideSource(raw: string, topicId: string, topicLabel: string): GuideSearchSection[] {
    const subTabLabels = new Map<string, string>();
    for (const match of raw.matchAll(TABS_TRIGGER_RE)) subTabLabels.set(match[1], match[2].trim());

    const sections: GuideSearchSection[] = [];
    const slugger = new GithubSlugger();
    const subTabStack: string[] = [];
    let current: GuideSearchSection | null = null;
    const bodyLines: string[] = [];

    const finalizeCurrent = () => {
        if (current) sections.push({ ...current, body: bodyLines.join(" ").trim() });
        bodyLines.length = 0;
    };

    for (const rawLine of raw.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("import ")) continue;

        const contentOpen = line.match(TABS_CONTENT_OPEN_RE);
        if (contentOpen) {
            subTabStack.push(contentOpen[1]);
            continue;
        }
        if (line.startsWith("</TabsContent>")) {
            subTabStack.pop();
            continue;
        }
        if (line.startsWith("<")) continue; // other JSX chrome (<Tabs>, <TabsList>, <TabsTrigger>, </Tabs>, </TabsList>)

        const headingMatch = line.match(HEADING_RE);
        if (headingMatch) {
            finalizeCurrent();
            const heading = stripMarkdownInline(headingMatch[2]);
            const subTabId = subTabStack[subTabStack.length - 1];
            current = {
                topicId,
                topicLabel,
                subTabId,
                subTabLabel: subTabId ? subTabLabels.get(subTabId) : undefined,
                heading,
                headingSlug: slugger.slug(heading),
                body: ""
            };
            continue;
        }

        if (current) bodyLines.push(stripMarkdownInline(line));
    }
    finalizeCurrent();

    return sections;
}

export const GUIDE_SEARCH_INDEX: GuideSearchSection[] = GUIDE_TOPICS.flatMap(topic =>
    parseGuideSource(topic.raw, topic.id, topic.label)
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
