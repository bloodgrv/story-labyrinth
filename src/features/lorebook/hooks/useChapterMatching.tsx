import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import type { LorebookEntry } from "@/types/story";

type MatchedEntriesByChapter = Map<string, Map<string, LorebookEntry>>;

interface ChapterMatchingContextValue {
    getMatchedEntries: (chapterId: string) => Map<string, LorebookEntry>;
    setMatchedEntries: (chapterId: string, entries: Map<string, LorebookEntry>) => void;
}

const ChapterMatchingContext = createContext<ChapterMatchingContextValue | null>(null);
const EMPTY_MATCHES = new Map<string, LorebookEntry>();

interface ChapterMatchingProviderProps {
    children: ReactNode;
}

// One shared provider (mounted once, in EditorTool), keyed by chapterId rather than one instance
// per open editor pane. A pane's LorebookTagPlugin only ever needs to update its OWN chapter's
// slice, and the shell's Tags drawer only ever needs to read one specific chapter's slice —
// keying this way means one pane's typing can't clobber another pane's matches (Editor
// MultiView, Task 1) while the shell-level Tags drawer still sees whichever chapter is
// currently focused.
export const ChapterMatchingProvider = ({ children }: ChapterMatchingProviderProps) => {
    const [byChapter, setByChapter] = useState<MatchedEntriesByChapter>(new Map());

    const getMatchedEntries = useCallback(
        (chapterId: string) => byChapter.get(chapterId) ?? EMPTY_MATCHES,
        [byChapter]
    );

    const setMatchedEntries = useCallback((chapterId: string, entries: Map<string, LorebookEntry>) => {
        setByChapter(prev => new Map(prev).set(chapterId, entries));
    }, []);

    return (
        <ChapterMatchingContext.Provider value={{ getMatchedEntries, setMatchedEntries }}>
            {children}
        </ChapterMatchingContext.Provider>
    );
};

export const useChapterMatching = (): ChapterMatchingContextValue => {
    const context = useContext(ChapterMatchingContext);
    if (!context) throw new Error("useChapterMatching must be used within ChapterMatchingProvider");

    return context;
};
