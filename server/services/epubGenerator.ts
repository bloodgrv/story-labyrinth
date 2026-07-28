import type { InferSelectModel } from "drizzle-orm";
import epubModule from "epub-gen-memory";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { convertLexicalToEpubHtml, escapeHtml } from "../../src/utils/export/convertLexicalToEpubHtml.js";
import type { schema } from "../db/client.js";

const epub = epubModule.default || epubModule;

type Story = InferSelectModel<typeof schema.stories>;
type Chapter = InferSelectModel<typeof schema.chapters>;

const DATA_URI_IMG_RE = /(<img[^>]+src=")(data:[^"]+)(")/g;

/**
 * epub-gen-memory fetches every `<img src>` via node-fetch, which does not
 * support `data:` URLs (only `file://`/`http(s)`). Chapter body images
 * pasted/dropped in the editor are stored as base64 data URIs directly in
 * the Lexical JSON — write each one out to a temp file and rewrite its src
 * to a `file://` URL so the generator can actually embed it.
 */
async function embedDataUriImages(html: string, tempDir: string, counter: { n: number }): Promise<string> {
    const matches = [...html.matchAll(DATA_URI_IMG_RE)];
    if (matches.length === 0) return html;

    let result = html;
    for (const [full, prefix, dataUri, suffix] of matches) {
        const commaIdx = dataUri.indexOf(",");
        if (commaIdx === -1) continue;

        const meta = dataUri.slice("data:".length, commaIdx);
        const isBase64 = meta.endsWith(";base64");
        const mime = (isBase64 ? meta.slice(0, -";base64".length) : meta) || "application/octet-stream";
        const ext = mime.split("/")[1]?.split("+")[0] || "bin";
        const payload = dataUri.slice(commaIdx + 1);
        const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf-8");

        const filePath = join(tempDir, `img-${counter.n++}.${ext}`);
        await writeFile(filePath, buffer);

        result = result.replace(full, `${prefix}${pathToFileURL(filePath).href}${suffix}`);
    }
    return result;
}

function formatChapterTitle(chapter: Chapter): string {
    return chapter.title?.trim() || `Chapter ${chapter.order}`;
}

function buildCopyrightLine(story: Story): string {
    const year = new Date(story.createdAt).getFullYear();
    return `© ${year} ${story.author}. All rights reserved.`;
}

/**
 * Generates a Kindle-ready EPUB from story and chapters (T3 / KDP1-KDP2).
 * Front matter is a minimal trade package (title page + generated copyright,
 * no synopsis in the body); chapter titles fall back to "Chapter {order}"
 * with no forced prefix; body HTML comes from the shared Lexical->HTML
 * converter (single SoT for the EPUB path, KDP1).
 */
export const generateEpub = async (story: Story, chapters: Chapter[]): Promise<Buffer> => {
    const tempDir = await mkdtemp(join(tmpdir(), "sn-epub-"));
    const imgCounter = { n: 0 };

    try {
        const chapterHtmls = await Promise.all(
            chapters.map(async chapter => {
                const bodyHtml = convertLexicalToEpubHtml(chapter.content);
                return embedDataUriImages(bodyHtml, tempDir, imgCounter);
            })
        );

        const frontMatter = {
            title: "",
            content: `
                <div class="title-page">
                    <h1 class="cover-title">${escapeHtml(story.title)}</h1>
                    <p class="cover-author">by ${escapeHtml(story.author)}</p>
                </div>
                <div class="copyright-page">
                    <p class="copyright-line">${escapeHtml(buildCopyrightLine(story))}</p>
                </div>
            `,
            excludeFromToc: true,
            beforeToc: true
        };

        const epubChapters = [
            frontMatter,
            ...chapters.map((chapter, idx) => {
                const title = formatChapterTitle(chapter);
                return {
                    title,
                    content: `<h1 class="chapter-title">${escapeHtml(title)}</h1><div class="chapter-content">${chapterHtmls[idx]}</div>`
                };
            })
        ];

        // Minimal Kindle-native CSS (lock 3d): no embedded fonts, no font-family
        // declaration at all — the device's default typeface wins.
        const css = `
            .title-page {
                text-align: center;
                page-break-after: always;
            }
            .cover-title {
                font-size: 2.5em;
                font-weight: bold;
                margin-bottom: 0.5em;
            }
            .cover-author {
                font-size: 1.5em;
                font-style: italic;
            }
            .copyright-page {
                text-align: center;
                margin-top: 4em;
            }
            .copyright-line {
                font-size: 0.9em;
            }
            .chapter-title {
                font-size: 1.5em;
                font-weight: bold;
                margin-top: 2em;
                margin-bottom: 1em;
                text-align: center;
                page-break-before: always;
            }
            .chapter-content {
                text-align: justify;
            }
            p {
                text-indent: 1.5em;
                margin: 0;
            }
            p.p-noindent {
                text-indent: 0;
            }
            p.scene-break {
                text-align: center;
                text-indent: 0;
                margin: 1.5em 0;
            }
            img {
                max-width: 100%;
                height: auto;
            }
            h1, h2, h3, h4, h5, h6 {
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                font-weight: bold;
            }
            blockquote {
                margin: 1em 2em;
                font-style: italic;
            }
        `;

        const options = {
            title: story.title,
            author: story.author,
            ...(story.synopsis && { description: story.synopsis }),
            lang: story.language || "en",
            prependChapterTitles: false,
            css
        };

        return await epub(options, epubChapters);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
};
