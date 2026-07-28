export interface SerializedLexicalNode {
    type: string;
    text?: string;
    children?: SerializedLexicalNode[];
    tag?: string;
    version?: number;
    format?: number;
    listType?: "bullet" | "number" | "check";
    checked?: boolean;
    src?: string;
    altText?: string;
}

export interface LexicalEditorState {
    root?: {
        children?: SerializedLexicalNode[];
    };
}

export type ExportFormat = "html" | "text" | "markdown" | "epub" | "pdf";
