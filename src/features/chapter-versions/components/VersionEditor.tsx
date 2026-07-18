import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import MarkdownShortcutPlugin from "@/components/story-editor/plugins/MarkdownShortcutPlugin";
import { LoadChapterVersionContentPlugin } from "@/components/story-editor/plugins/LoadChapterVersionContent";
import { SaveChapterVersionContentPlugin } from "@/components/story-editor/plugins/SaveChapterVersionContent";
import PlaygroundNodes from "@/components/story-editor/nodes";
import PlaygroundEditorTheme from "@/components/story-editor/themes/PlaygroundEditorTheme";
import ContentEditable from "@/components/story-editor/ui/ContentEditable";
import { logger } from "@/utils/logger";
import type { ChapterVersion } from "@/types/chapterVersion";
import { VersionToolbar } from "./VersionToolbar";

interface VersionEditorProps {
    chapterId: string;
    version: ChapterVersion;
}

// A separate, deliberately lighter LexicalComposer instance for one chapter version — not the
// main story-editor's App/Editor.tsx, which bakes in several plugins (focus-session word
// tracking, beat-marking, grammar-check) hardcoded to report against whatever chapter is
// globally active via EditorPaneContext's fallback. A version tab isn't wrapped in an
// EditorPaneProvider, so those plugins would silently act on the wrong chapter if reused here.
// This gets real rich-text editing (bold/italic/paragraphs/undo-redo/markdown shortcuts) without
// that coupling risk. See DECISIONS.md's "Story-Layer Chapter Versioning" entry.
export function VersionEditor({ chapterId, version }: VersionEditorProps) {
    const initialConfig = {
        namespace: `ChapterVersion-${version.id}`,
        nodes: [...PlaygroundNodes],
        onError: (error: Error) => logger.error("VersionEditor - Lexical error:", error),
        theme: PlaygroundEditorTheme
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="flex h-full flex-col">
                <VersionToolbar />
                <div className="editor-container flex-1 overflow-y-auto">
                    <LoadChapterVersionContentPlugin versionId={version.id} content={version.content} />
                    <SaveChapterVersionContentPlugin chapterId={chapterId} versionId={version.id} />
                    <AutoFocusPlugin />
                    <HistoryPlugin />
                    <RichTextPlugin
                        contentEditable={
                            <div className="editor-scroller">
                                <div className="editor">
                                    <ContentEditable placeholder="Start writing this version..." />
                                </div>
                            </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <MarkdownShortcutPlugin />
                </div>
            </div>
        </LexicalComposer>
    );
}
