import { X } from "lucide-react";
import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
    content: string;
    className?: string;
    onDelete?: () => void;
    onEdit?: () => void;
    showDelete?: boolean;
}

// Define our own CodeComponentProps interface
interface CodeComponentProps {
    node?: unknown;
    inline?: boolean;
    className?: string;
    children?: ReactNode;
}

// B11 — react-markdown/rehype-raw will happily parse a block-level raw HTML tag (e.g. a model
// hallucinating a literal `<pre>` inline, no blank line before it — see B3's malformed-HTML chat
// messages) as a child of whatever paragraph it appeared in, producing invalid `<p><pre>...` DOM
// that React warns about ("In HTML, <pre> cannot be a descendant of <p>"). The `p` override below
// downgrades to a `<div>` whenever any child is one of these, so the wrapper element always
// matches the content instead of assuming every paragraph child is inline.
const BLOCK_LEVEL_TAGS = new Set(["pre", "div", "table", "ul", "ol", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr"]);
const hasBlockLevelChild = (children: ReactNode): boolean =>
    Children.toArray(children).some(child => isValidElement(child) && typeof child.type === "string" && BLOCK_LEVEL_TAGS.has(child.type));

export default function MarkdownRenderer({ content, className, onDelete, onEdit, showDelete }: MarkdownRendererProps) {
    if (!content) return null;

    return (
        <div className="relative group">
            {showDelete && (onDelete || onEdit) && (
                <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 flex gap-1 items-center transition-opacity">
                    {onEdit && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={e => {
                                e.stopPropagation();
                                onEdit();
                            }}
                        >
                            <svg
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                        </Button>
                    )}
                    {showDelete && onDelete && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={e => {
                                e.stopPropagation();
                                onDelete();
                            }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            )}
            <div className={cn("prose prose-sm max-w-none", className)}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    components={{
                        p: ({ children }) =>
                            hasBlockLevelChild(children) ? (
                                <div className="mb-2 last:mb-0">{children}</div>
                            ) : (
                                <p className="mb-2 last:mb-0">{children}</p>
                            ),
                        // P0.4 S2 — Research citations render as real markdown links (see
                        // chatContextService.ts's RESEARCH_FRAMING); without this override they'd
                        // navigate the whole SPA tab away instead of opening in a new one. Applies
                        // to every markdown-rendered message/note app-wide, not just Research —
                        // strictly better UX, no other behavior change.
                        a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                            </a>
                        ),
                        code: ({ inline, className, children, ...props }: CodeComponentProps) => {
                            const match = /language-(\w+)/.exec(className || "");
                            // Non-inline code is already wrapped by the `pre` override below —
                            // wrapping it again here nested a second, redundant `<pre>` inside the
                            // first (B11: found while investigating the pre-inside-p warning below).
                            return (
                                <code className={cn("text-xs", inline && "bg-muted px-1 py-0.5 rounded", match && `language-${match[1]}`)} {...props}>
                                    {children}
                                </code>
                            );
                        },
                        pre: ({ children }) => (
                            <pre className="overflow-x-auto p-2 bg-muted rounded whitespace-pre-wrap break-all">
                                {children}
                            </pre>
                        )
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        </div>
    );
}
