const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Pulls citation links out of a Research reply's markdown (RESEARCH_FRAMING requires the model to
// cite sources this way) for a Chat Shuttle return packet's `links` field (H5, docs/
// Chat_Shuttle_Design.md). De-duplicates by url — a source cited inline and again in a trailing
// "Sources:" list shouldn't appear twice.
export const extractMarkdownLinks = (content: string): { title: string; url: string }[] => {
    const seen = new Set<string>();
    const links: { title: string; url: string }[] = [];
    for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
        const [, title, url] = match;
        if (seen.has(url)) continue;
        seen.add(url);
        links.push({ title, url });
    }
    return links;
};
