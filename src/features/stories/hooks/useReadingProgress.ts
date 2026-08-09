import { useEffect, useRef } from "react";

interface ReadingProgress {
    chapterId: string;
    offset: number;
    updatedAt: number;
}

const storageKey = (storyId: string) => `sn-reading-progress:${storyId}`;

// Reader mode is one continuous scroll across every chapter (StoryReader.tsx), so "bookmark" is
// tracked as { chapterId, offsetFromChapterTop } rather than a raw scrollY — that stays accurate
// even if earlier chapters are edited/reordered later, since the target chapter's own offsetTop
// is re-measured on each visit instead of relying on a stale absolute page position.
export function useReadingProgress(storyId: string, ready: boolean) {
    const restoredRef = useRef(false);

    useEffect(() => {
        if (!ready || restoredRef.current) return;
        restoredRef.current = true;

        const raw = localStorage.getItem(storageKey(storyId));
        if (!raw) return;

        let saved: ReadingProgress;
        try {
            saved = JSON.parse(raw);
        } catch {
            return;
        }

        // Lexical content (and any images) paint asynchronously after mount, so offsetTop isn't
        // reliable until a tick after the initial render settles.
        const timer = setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-chapter-id="${saved.chapterId}"]`);
            if (!el) return;
            window.scrollTo({ top: el.offsetTop + saved.offset, behavior: "auto" });
        }, 150);

        return () => clearTimeout(timer);
    }, [ready, storyId]);

    useEffect(() => {
        if (!ready) return;

        const save = () => {
            const chapterEls = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter-id]"));
            if (chapterEls.length === 0) return;

            let current = chapterEls[0];
            for (const el of chapterEls) {
                if (el.offsetTop <= window.scrollY + 80) current = el;
                else break;
            }

            const chapterId = current.dataset.chapterId;
            if (!chapterId) return;

            const progress: ReadingProgress = {
                chapterId,
                offset: window.scrollY - current.offsetTop,
                updatedAt: Date.now()
            };
            localStorage.setItem(storageKey(storyId), JSON.stringify(progress));
        };

        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        const onScroll = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(save, 400);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (debounceTimer) clearTimeout(debounceTimer);
            save();
        };
    }, [ready, storyId]);
}
