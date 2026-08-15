import GithubSlugger from "github-slugger";

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
// callers of this parser need the topics' raw source text instead (via Vite's `?raw` convention
// client-side, or a plain fs.readFileSync server-side — see guideSearchIndex.ts and
// server/services/guideSearchService.ts respectively). Content is deliberately NOT included here
// so this module stays framework-agnostic (no Vite-specific import syntax, safe for the server).
export const GUIDE_TOPIC_META: { id: string; label: string }[] = [
    { id: "basics", label: "Basics Guide" },
    { id: "settings-nav", label: "Settings & Navigation" },
    { id: "advanced", label: "Advanced Guide" },
    { id: "lorebook", label: "Lorebook Guide" },
    { id: "locations-maps", label: "Locations & Maps" },
    { id: "story-timeline", label: "Story Timeline" },
    { id: "ai-review", label: "AI Review" },
    { id: "relationships", label: "Relationships" },
    { id: "memory", label: "Memory" },
    { id: "prompts", label: "Prompt Guide" },
    { id: "chat-features", label: "Chat Features" },
    { id: "research", label: "Research" },
    { id: "notes", label: "Notes" },
    { id: "brainstorm", label: "Brainstorm Guide" },
    { id: "tts", label: "Text-to-Speech" },
    { id: "concrete-beats", label: "Concrete Beats" },
    { id: "name-generator", label: "Name Generator" },
    { id: "multiview", label: "MultiView" },
    { id: "outline", label: "Outline" },
    { id: "focus-sessions", label: "Writing Sessions" }
];

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const TABS_TRIGGER_RE = /<TabsTrigger\s+value="([^"]+)"[^>]*>([^<]*)<\/TabsTrigger>/g;
const TABS_CONTENT_OPEN_RE = /^<TabsContent\s+value="([^"]+)"/;

// Strip inline markdown formatting so both the displayed heading text and the slug we compute
// match what rehype-slug actually sees (the heading's rendered plain text, not its raw markdown
// source) — see vite.config.ts's rehypeSlug addition.
export const stripMarkdownInline = (text: string): string =>
    text
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .trim();

// Plain-text parser over an .mdx file's raw SOURCE (never compiled/evaluated as MDX — so it
// can't reintroduce the "{number}" class of crash fixed earlier this session). Only recognizes
// the exact JSX shapes these guide files actually use: a top-level `import ... from "...";` line,
// and at most one level of `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>` nesting
// (advanced, lorebook, prompts). Any other line starting with `<` is skipped as JSX chrome.
export function parseGuideSource(raw: string, topicId: string, topicLabel: string): GuideSearchSection[] {
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
