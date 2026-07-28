import type { LexicalEditorState, SerializedLexicalNode } from "./types.js";

/**
 * Single Lexical → HTML mapping for the EPUB export path (KDP1).
 *
 * Pure string builder — no DOM APIs — so it runs identically in the browser
 * and in the Node server (unlike `convertLexicalToHtml.ts`, which requires
 * `document` and cannot run server-side).
 *
 * Fiction-core node mapping per docs/Amazon_KDP_Export_Design.md (lock 4b):
 * paragraph / emphasis / headings-as-subheads / quote / linebreak / lists /
 * images render faithfully; exotics (tables, code, editor-only chrome nodes)
 * collapse to plain/stacked text — never ship UI chrome into the book.
 */

const SCENE_BREAK_TEXT = new Set(["***", "* * *", "---"]);

export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
    return escapeHtml(text).replace(/"/g, "&quot;");
}

/** True for a leaf node (no children array) that carries its own text — covers
 * `text` plus any TextNode subclass with a different `type` (e.g. `hashtag`,
 * this app's `special-text`) whose text would otherwise be silently dropped. */
function isTextLeaf(node: SerializedLexicalNode): boolean {
    return typeof node.text === "string" && !Array.isArray(node.children);
}

function renderTextLeaf(node: SerializedLexicalNode): string {
    let html = escapeHtml(node.text || "");
    const format = node.format || 0;
    const isBold = (format & 1) !== 0;
    const isItalic = (format & 2) !== 0;
    const isStrikethrough = (format & 4) !== 0;
    const isUnderline = (format & 8) !== 0;
    const isCode = (format & 16) !== 0;

    if (isCode) return `<code>${html}</code>`;
    if (isBold) html = `<strong>${html}</strong>`;
    if (isItalic) html = `<em>${html}</em>`;
    if (isUnderline) html = `<u>${html}</u>`;
    if (isStrikethrough) html = `<s>${html}</s>`;
    return html;
}

function renderChildren(node: SerializedLexicalNode): string {
    return node.children?.map(processInline).join("") || "";
}

/** Renders a node's own markup (used for content nested inside a block, e.g.
 * headings, list items, table cells, quotes) — never emits its own <p>. */
function processInline(node: SerializedLexicalNode): string {
    if (isTextLeaf(node)) return renderTextLeaf(node);
    if (node.type === "linebreak") return "<br/>";

    if (node.type === "list") {
        const tag = node.listType === "number" ? "ol" : "ul";
        return `<${tag}>${renderChildren(node)}</${tag}>`;
    }
    if (node.type === "listitem") {
        const checkbox = node.checked !== undefined ? (node.checked ? "☑ " : "☐ ") : "";
        return `<li>${checkbox}${renderChildren(node)}</li>`;
    }
    if (node.type === "image") {
        const src = node.src ? escapeAttr(node.src) : "";
        const alt = node.altText ? escapeAttr(node.altText) : "";
        return src ? `<img src="${src}" alt="${alt}"/>` : "";
    }
    if (node.type === "quote") return `<blockquote>${renderChildren(node)}</blockquote>`;
    if (node.type === "heading" && node.tag) {
        const level = parseInt(node.tag, 10) || 2;
        return `<h${level}>${renderChildren(node)}</h${level}>`;
    }
    if (node.type === "table") {
        const rows = node.children?.map(processInline).join("") || "";
        return rows;
    }
    if (node.type === "tablerow") {
        const cells = node.children?.map((cell: SerializedLexicalNode) => renderChildren(cell)).join(" | ") || "";
        return cells ? `<p>${cells}</p>` : "";
    }

    // Exotic / editor-only chrome nodes (code, tables handled above, collapsibles,
    // layouts, page breaks, mark wrappers, etc.) — collapse to plain text, no chrome.
    if (node.children) return renderChildren(node);
    return "";
}

function collectPlainText(node: SerializedLexicalNode): string {
    if (isTextLeaf(node)) return node.text || "";
    if (node.children) return node.children.map(collectPlainText).join("");
    return "";
}

/** A node contributes nothing visually — a blank text leaf or a linebreak —
 * as opposed to real content like an image that just happens to have no text. */
function isEffectivelyEmpty(node: SerializedLexicalNode): boolean {
    if (isTextLeaf(node)) return !node.text;
    if (node.type === "linebreak") return true;
    if (node.children) return node.children.every(isEffectivelyEmpty);
    return false;
}

/** True when a paragraph-shaped block signals a scene break: no content at
 * all, or its trimmed text is exactly `***`, `* * *`, or `---`. A paragraph
 * holding non-text content (e.g. an image with no caption) is never a break,
 * even though it has no text of its own. */
function isSceneBreakParagraph(node: SerializedLexicalNode): boolean {
    const children = node.children || [];
    if (children.length === 0 || children.every(isEffectivelyEmpty)) return true;
    if (!children.every(child => isTextLeaf(child) || child.type === "linebreak")) return false;

    const text = collectPlainText(node).trim();
    return text.length === 0 || SCENE_BREAK_TEXT.has(text);
}

const SCENE_BREAK_HTML = '<p class="scene-break">* * *</p>';

/**
 * Converts a chapter's Lexical JSON content into EPUB body HTML.
 *
 * Consecutive scene-break signals (blank paragraphs / `***`-only paragraphs /
 * inserted horizontal rules) collapse into a single break glyph. The
 * paragraph immediately following a scene break (or the very first paragraph
 * of the chapter, right after its title) gets `class="p-noindent"` so the
 * CSS can drop the trade first-line indent there.
 */
export function convertLexicalToEpubHtml(jsonContent: string): string {
    const editorState: LexicalEditorState = JSON.parse(jsonContent);
    const blocks = editorState.root?.children;
    if (!blocks || blocks.length === 0) return "";

    const out: string[] = [];
    let noIndentNext = true;
    let lastWasBreak = false;

    for (const node of blocks) {
        const isBreakSignal =
            node.type === "horizontalrule" || (node.type === "paragraph" && isSceneBreakParagraph(node));

        if (isBreakSignal) {
            if (!lastWasBreak) out.push(SCENE_BREAK_HTML);
            lastWasBreak = true;
            noIndentNext = true;
            continue;
        }
        lastWasBreak = false;

        if (node.type === "paragraph") {
            const cls = noIndentNext ? ' class="p-noindent"' : "";
            out.push(`<p${cls}>${renderChildren(node)}</p>`);
            noIndentNext = false;
            continue;
        }

        out.push(processInline(node));
    }

    return out.join("");
}
