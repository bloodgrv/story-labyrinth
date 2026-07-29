import type { LexicalEditorState, SerializedLexicalNode } from "./types";

/**
 * Converts Lexical JSON content to Markdown
 * @param jsonContent The Lexical JSON content string
 * @returns Markdown string representation of the content
 */
export function convertLexicalToMarkdown(jsonContent: string): string {
    const editorState: LexicalEditorState = JSON.parse(jsonContent);
    const lines: string[] = [];

    const processNode = (node: SerializedLexicalNode): string => {
        if (node.type === "text" && node.text) {
            const text = node.text;
            if (node.format) {
                const isBold = (node.format & 1) !== 0;
                const isItalic = (node.format & 2) !== 0;
                const isUnderline = (node.format & 8) !== 0;
                const isCode = (node.format & 16) !== 0;

                if (isCode) return `\`${text}\``;
                let formatted = text;
                if (isBold) formatted = `**${formatted}**`;
                if (isItalic) formatted = `_${formatted}_`;
                if (isUnderline) formatted = `<u>${formatted}</u>`;
                return formatted;
            }
            return text;
        } else if (node.type === "linebreak") return "  \n";
        else if (node.type === "paragraph") {
            const childrenText = node.children ? node.children.map(processNode).join("") : "";
            return `${childrenText}\n\n`;
        } else if (node.type === "heading" && node.tag) {
            const level = parseInt(node.tag, 10);
            const prefix = "#".repeat(level);
            const childrenText = node.children ? node.children.map(processNode).join("") : "";
            return `${prefix} ${childrenText}\n\n`;
        } else if (node.type === "list") return `${renderList(node, 0).trimEnd()}\n\n`;
        else if (node.children) return node.children.map(processNode).join("");

        return "";
    };

    // GFM nested lists indent by 2 spaces per level under the parent item's marker, and a nested
    // list's own items are rendered on their own lines rather than concatenated onto the parent
    // item's line — walked directly (not through the generic processNode dispatcher above) so
    // depth can be tracked across recursive calls without threading a depth param through every
    // other node type that doesn't need one.
    const renderList = (node: SerializedLexicalNode, depth: number): string => {
        const isOrdered = node.listType === "number";
        const indent = "  ".repeat(depth);
        const lines: string[] = [];

        (node.children ?? []).forEach((child, index) => {
            const marker = isOrdered ? `${index + 1}.` : "-";
            const checkbox = child.checked !== undefined ? (child.checked ? "[x] " : "[ ] ") : "";
            const inlineChildren = (child.children ?? []).filter(c => c.type !== "list");
            const nestedLists = (child.children ?? []).filter(c => c.type === "list");
            const inlineText = inlineChildren.map(processNode).join("");

            lines.push(`${indent}${marker} ${checkbox}${inlineText}`);
            for (const nested of nestedLists) lines.push(renderList(nested, depth + 1).trimEnd());
        });

        return `${lines.join("\n")}\n`;
    };

    if (editorState.root?.children)
        editorState.root.children.forEach(node => {
            const text = processNode(node);
            if (text) lines.push(text);
        });

    return lines.join("").trim();
}
