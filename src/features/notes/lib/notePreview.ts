// Plain-text preview helper shared by NoteCard/NoteRow (T7) and NoteEditor's rework capture —
// strips the WYSIWYG body's HTML markup down to a short, single-line preview. Never touches the
// note's own stored content.
export const stripHtml = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const notePreviewText = (html: string, maxLength = 140): string => {
    const plain = stripHtml(html);
    return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}…` : plain;
};
