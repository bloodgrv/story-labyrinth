import * as cheerio from "cheerio";

// P0.4 S1 — no search API key: scrapes DuckDuckGo's html-only endpoint (the same one the
// Python `ddgs` package targets), per explicit user choice over a keyed provider (Tavily/Brave/
// SerpAPI). Unofficial/best-effort — no SLA, may occasionally rate-limit or serve a CAPTCHA to a
// scraper. Every function here fails soft (returns [] / null) rather than throwing, since this
// runs inline in the chat-send path (chatContextService.ts's getChatContext) and a flaky scrape
// must never break message sending.

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface FetchedPage {
    title: string;
    text: string;
}

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SEARCH_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_TEXT_CHARS = 4000;

// DDG's html-only endpoint wraps result links in a redirect:
// //duckduckgo.com/l/?uddg=<encoded-real-url>&rut=... — unwrap to the real target.
const unwrapDdgUrl = (href: string): string => {
    try {
        const uddg = new URL(href, "https://duckduckgo.com").searchParams.get("uddg");
        return uddg ? decodeURIComponent(uddg) : href;
    } catch {
        return href;
    }
};

export const searchWeb = async (query: string, maxResults = 5): Promise<WebSearchResult[]> => {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];

        const $ = cheerio.load(await res.text());
        const results: WebSearchResult[] = [];
        $(".result").each((_, el) => {
            if (results.length >= maxResults) return;
            const titleEl = $(el).find(".result__a").first();
            const title = titleEl.text().trim();
            const href = titleEl.attr("href");
            if (!title || !href) return;
            results.push({ title, url: unwrapDdgUrl(href), snippet: $(el).find(".result__snippet").text().trim() });
        });
        return results;
    } catch {
        return [];
    }
};

export const fetchPage = async (url: string): Promise<FetchedPage | null> => {
    try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) return null;

        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return null;

        const $ = cheerio.load(await res.text());
        $("script, style, nav, header, footer, noscript, iframe").remove();
        return {
            title: $("title").first().text().trim() || url,
            text: $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_TEXT_CHARS)
        };
    } catch {
        return null;
    }
};
