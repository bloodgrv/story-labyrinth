import sanitizeHtml from "sanitize-html";

// B42 (docs/CODE_REVIEW_2026-08-17.md) — Notes and chapter Scribble both store rich text as raw
// HTML from react-simple-wysiwyg's contentEditable-based editor (unlike chat markdown, which
// already goes through rehype-sanitize client-side — see MarkdownRenderer.tsx). That HTML is
// hydrated back into a contentEditable div's innerHTML on every read, not rendered through
// React's normal escaped-text path, so any <script>/onerror=/javascript: survives round-trip and
// executes for whoever next opens the note — including a viewer/editor-authored note later opened
// by the owner, a real cross-role privilege-escalation shape given this app's role hierarchy, not
// just theoretical self-XSS. Sanitized server-side (not just client-side) so the stored data is
// safe regardless of what wrote it — the WYSIWYG editor's own UI, but also a note-proposal/
// note-split-proposal AI fence, a document import, or a direct API call, none of which route
// through the editor's own composition path at all.
const ALLOWED_TAGS = [
    "b", "strong", "i", "em", "u", "s", "strike",
    "p", "div", "span", "br",
    "ul", "ol", "li",
    "blockquote", "code", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "a"
];

const sanitizeOptions: sanitizeHtml.IOptions = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
        a: ["href", "title", "target", "rel"]
    },
    // Default scheme allowlist already excludes javascript:/data: for href — kept explicit here
    // so a future edit to this file can't accidentally drop it.
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false
};

export const sanitizeNoteHtml = (html: string): string => sanitizeHtml(html, sanitizeOptions);
