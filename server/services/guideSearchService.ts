import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDE_TOPIC_META, type GuideSearchSection, parseGuideSource } from "../../src/features/guide/lib/guideSearchParser.js";

// Mirrors src/features/guide/lib/guideSearchIndex.ts's client-side index, but reads the same 16
// .mdx files directly off disk instead of via Vite's `?raw` import convention (unavailable here —
// this runs under tsx, not Vite). Built once at module load: the guide is static, dev-authored
// content that only changes on a redeploy, same posture as name-packs (nameGeneratorPackService.ts).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_DIR = path.join(__dirname, "../../src/features/guide/content");

const GUIDE_SEARCH_INDEX: GuideSearchSection[] = GUIDE_TOPIC_META.flatMap(topic => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, `${topic.id}.mdx`), "utf-8");
    return parseGuideSource(raw, topic.id, topic.label);
});

// Common English filler words that would otherwise dominate a full chat sentence's word-overlap
// score against arbitrary guide headings (e.g. "how", "do", "the") — short and deliberately
// conservative; this only needs to suppress noise, not do real NLP.
const STOPWORDS = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "i", "you", "he", "she", "it", "we", "they", "my", "your", "this", "that", "these", "those",
    "do", "does", "did", "can", "could", "should", "would", "will", "shall", "may", "might",
    "how", "what", "when", "where", "why", "who", "which",
    "to", "of", "in", "on", "at", "for", "with", "and", "or", "but", "not", "no",
    "so", "if", "than", "then", "there", "here", "up", "down", "out", "get", "got",
    "story", "chapter", "want", "like", "just", "please", "help", "app"
]);

const extractContentWords = (message: string): string[] =>
    [...new Set(message.toLowerCase().match(/[a-z0-9']+/g) ?? [])].filter(w => w.length > 2 && !STOPWORDS.has(w));

// Distinct from guideSearchIndex.ts's searchGuide: that one is tuned for short, deliberate
// search-box queries (require every word to match). Chat messages are full sentences, and even
// after stopword-stripping they still carry generic English words ("after", "next", "way") that
// coincidentally appear somewhere in 16 files' worth of documentation prose — scattered body-only
// overlap turned out to be too weak a signal on its own (verified live: an ordinary "what should
// happen in the next chapter" story question matched 3 unrelated sections purely on "next"/
// "after" body hits). Requiring at least one query word to appear in the SECTION'S OWN HEADING —
// a much stronger "this is really what they're asking about" signal — plus a minimum total score,
// is what actually suppresses that noise.
const MIN_SCORE = 3;
const HEADING_MATCH_WEIGHT = 3;

export function searchGuideForChat(message: string, maxResults = 3): GuideSearchSection[] {
    const words = extractContentWords(message);
    if (words.length === 0) return [];

    const scored = GUIDE_SEARCH_INDEX.map(section => {
        const headingLower = section.heading.toLowerCase();
        const bodyLower = section.body.toLowerCase();
        let score = 0;
        let headingHits = 0;
        for (const word of words) {
            if (headingLower.includes(word)) {
                score += HEADING_MATCH_WEIGHT;
                headingHits += 1;
            } else if (bodyLower.includes(word)) score += 1;
        }
        return { section, score, headingHits };
    }).filter(r => r.headingHits > 0 && r.score >= MIN_SCORE);

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults).map(r => r.section);
}
