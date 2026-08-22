import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { GenerateNamesResponse, UsedNameType } from "@/types/nameGenerator";
import type { LorebookEntry } from "@/types/story";
import type { MapSketchElementSkeleton } from "@/types/storyMaps";

export interface NameGeneratorRecentBatch {
    id: string;
    label: string;
    result: GenerateNamesResponse;
    // The kind this batch was generated with — not necessarily the panel's *current* kind
    // selection, if the user switched Surname/First name between generates.
    nameType: UsedNameType;
}

export type WorkspaceTool =
    | "stories"
    | "series"
    | "editor"
    | "chapters"
    | "outline"
    | "lorebook"
    | "brainstorm"
    | "notes"
    | "users"
    | "research"
    | "memory"
    | "relationships"
    | "story-map"
    | "story-timeline"
    | "scanner"
    | "ai-review"
    | "name-generator"
    | "playbooks";

interface StoryContextType {
    currentStoryId: string | null;
    currentChapterId: string | null;
    currentTool: WorkspaceTool;
    setCurrentStoryId: (storyId: string | null) => void;
    setCurrentChapterId: (chapterId: string | null) => void;
    setCurrentTool: (tool: WorkspaceTool) => void;
    resetContext: () => void;
    // Ephemeral, one-shot cross-tool navigation pointer (Relationships graph -> Lorebook "open
    // entry"). Deliberately NOT localStorage-persisted, unlike every other field here — it only
    // needs to survive the single setCurrentTool("lorebook") re-render that follows it.
    pendingLorebookEntryId: string | null;
    setPendingLorebookEntryId: (id: string | null) => void;
    // Same posture as pendingLorebookEntryId above, for the Outline chat's "Open in WB" lore-
    // suggestion handoff (P0.4 R8) — a suggested new entity's seed content, consumed once by
    // LorebookPage to pre-fill CreateEntryDialog, then cleared.
    // detail (optional) — Brainstorm's own handoff-packet's longer paste-ready text, used to
    // auto-seed the docked WB chat's composer once a chat is auto-started for this seed (see
    // LorebookEntryEditor.tsx's WorldBuildingChatPanel). Other producers (Outline lore-suggestion,
    // Name Generator) omit it, so no chat auto-starts for those — tab pre-fill only.
    pendingLorebookSeed: { name: string; category: LorebookEntry["category"]; blurb: string; detail?: string } | null;
    setPendingLorebookSeed: (
        seed: { name: string; category: LorebookEntry["category"]; blurb: string; detail?: string } | null
    ) => void;
    // Generalized version of the same one-shot pattern, for Brainstorm's "Handoff → Outline/
    // Research" tray actions (P0.4 B0-B4) — the WB handoff destination keeps reusing
    // pendingLorebookSeed above unchanged (same shape a lore-suggestion already produces); this
    // covers destinations with no structured pre-fill dialog of their own, where "handoff" just
    // means "switch to that tool and prefill its chat composer with this text."
    pendingChatComposerSeed: { tool: WorkspaceTool; text: string } | null;
    setPendingChatComposerSeed: (seed: { tool: WorkspaceTool; text: string } | null) => void;
    // Chat Shuttle's own Open handoff (docs/Chat_Shuttle_Design.md, H2) — deliberately a separate
    // one-shot field from pendingChatComposerSeed rather than overloading it: ResearchTool needs
    // to know the ORIGIN chat id (to route a later "Send brief to origin" return packet, H5) and
    // force Story mode, neither of which the generic composer-seed field carries or implies.
    // Brainstorm's existing "Handoff -> Research" action keeps using pendingChatComposerSeed
    // unchanged (decision #4: "Brainstorm keeps existing handoff model").
    pendingShuttleSeed: { originChatId: string; shuttleItemId: string; text: string } | null;
    setPendingShuttleSeed: (seed: { originChatId: string; shuttleItemId: string; text: string } | null) => void;
    // Maps v2 (MV3) — same one-shot posture as pendingLorebookEntryId, for a location lore
    // entry's "Open map" affordance (RawEntryFields.tsx's OpenMapButton) to jump straight to a
    // specific map after switching to the Maps tool, consumed once by MapsTool.tsx then cleared.
    pendingMapId: string | null;
    setPendingMapId: (id: string | null) => void;
    // MV5 — the "Accept" path for a ```map-sketch-proposal chat fence (RawEntryFields' WB chat,
    // gated to the locations template). Same one-shot posture as pendingMapId, but also carries
    // the raw element skeleton the model proposed — MapsTool.tsx consumes both together (open this
    // map AND seed it with this skeleton), clearing this whenever pendingMapId would also clear.
    pendingMapSketch: { mapId: string; elements: MapSketchElementSkeleton[] } | null;
    setPendingMapSketch: (sketch: { mapId: string; elements: MapSketchElementSkeleton[] } | null) => void;
    // Story Timeline (TL1/TL3) — same one-shot posture as pendingMapId, for a "Place on timeline"
    // button elsewhere (or a pin's own "open" click) to jump to the Timeline tool and scroll/
    // highlight a specific pin, consumed once by TimelineTool.tsx then cleared.
    pendingTimelineFocusPinId: string | null;
    setPendingTimelineFocusPinId: (id: string | null) => void;
    // Story Timeline (TL3) — a linked pin's "open" action for a note (chapters use the existing
    // currentChapterId, lorebook uses pendingLorebookEntryId above; Notes had no equivalent
    // external-open hook before this — NotesTool.tsx only tracked selectedNoteId locally).
    pendingNoteId: string | null;
    setPendingNoteId: (id: string | null) => void;
    // AI Review (AR4, docs/AI_Review_Design.md) — Editor's "Review this chapter" entry point.
    // Same one-shot posture as pendingTimelineFocusPinId, for jumping to the AI Review tool with
    // the current chapter pre-checked in its multi-select, consumed once by AiReviewPanel.tsx.
    pendingAiReviewChapterId: string | null;
    setPendingAiReviewChapterId: (id: string | null) => void;
    // In-progress (unsent) chat composer text, keyed by chat id. Lives here rather than in
    // ChatInterface's own state because switching workspace tools (e.g. Editor -> Lorebook and
    // back) unmounts/remounts ChatInterface — a plain useState there loses whatever the user was
    // mid-typing. Also localStorage-persisted (STORAGE_KEY_CHAT_DRAFTS below) so it survives a
    // page reload or the dev server restarting, same as currentStoryId/currentChapterId/
    // currentTool above. This is purely a composer-input safety net — it has nothing to do with
    // chapter content itself, which already autosaves to the DB via SaveChapterContentPlugin/
    // chapterSnapshots independent of this.
    chatDrafts: Record<string, string>;
    setChatDraft: (chatId: string, text: string) => void;
    // Bumped whenever a chapter's content changes from OUTSIDE the live editor's own autosave
    // loop (currently: History drawer restore, P0.2b) — LoadChapterContentPlugin's own "only
    // load once per chapterId" gate has no other way to learn the DB content changed out from
    // under it, since chapters has no updatedAt column to diff against. A plain counter, not a
    // boolean, so re-triggering with the editor already showing the same chapterId still fires
    // the effect (a boolean set back to its own value wouldn't).
    chapterContentRefreshToken: number;
    refreshChapterContent: () => void;
    // Name Generator's recent generate-batch results, keyed by storyId. Lives here rather than in
    // NameGeneratorPanel's own state because switching workspace tools unmounts/remounts the panel
    // (MainContent's tool switch is a plain conditional render, not a hide/show) — a local useState
    // there loses every result the moment the user tabs away, same problem chatDrafts above solves
    // for chat composer text.
    nameGeneratorBatches: Record<string, NameGeneratorRecentBatch[]>;
    setNameGeneratorBatches: (storyId: string, batches: NameGeneratorRecentBatch[]) => void;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

const STORAGE_KEY_STORY_ID = "workspace-last-story-id";
const STORAGE_KEY_TOOL = "workspace-current-tool";
const STORAGE_KEY_CHAT_DRAFTS = "workspace-chat-drafts";
const CHAPTER_KEY = (storyId: string) => `workspace-chapter-id-${storyId}`;

const loadPersistedChatDrafts = (): Record<string, string> => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_CHAT_DRAFTS);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
};

export function StoryProvider({ children }: { children: ReactNode }) {
    // Initialize from localStorage
    const [currentStoryId, setCurrentStoryIdState] = useState<string | null>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_STORY_ID);
        return stored || null;
    });

    const [currentChapterId, setCurrentChapterIdState] = useState<string | null>(() => {
        const storedStoryId = localStorage.getItem(STORAGE_KEY_STORY_ID);
        if (!storedStoryId) return null;
        return localStorage.getItem(CHAPTER_KEY(storedStoryId)) || null;
    });

    const [pendingLorebookEntryId, setPendingLorebookEntryId] = useState<string | null>(null);
    const [pendingLorebookSeed, setPendingLorebookSeed] = useState<StoryContextType["pendingLorebookSeed"]>(null);
    const [pendingChatComposerSeed, setPendingChatComposerSeed] = useState<StoryContextType["pendingChatComposerSeed"]>(null);
    const [pendingShuttleSeed, setPendingShuttleSeed] = useState<StoryContextType["pendingShuttleSeed"]>(null);
    const [pendingMapId, setPendingMapId] = useState<string | null>(null);
    const [pendingMapSketch, setPendingMapSketch] = useState<StoryContextType["pendingMapSketch"]>(null);
    const [pendingTimelineFocusPinId, setPendingTimelineFocusPinId] = useState<string | null>(null);
    const [pendingNoteId, setPendingNoteId] = useState<string | null>(null);
    const [pendingAiReviewChapterId, setPendingAiReviewChapterId] = useState<string | null>(null);
    const [chatDrafts, setChatDrafts] = useState<Record<string, string>>(loadPersistedChatDrafts);
    const setChatDraft = (chatId: string, text: string) =>
        setChatDrafts(prev => (text ? { ...prev, [chatId]: text } : Object.fromEntries(Object.entries(prev).filter(([id]) => id !== chatId))));
    const [chapterContentRefreshToken, setChapterContentRefreshToken] = useState(0);
    const refreshChapterContent = () => setChapterContentRefreshToken(token => token + 1);
    const [nameGeneratorBatches, setNameGeneratorBatchesState] = useState<Record<string, NameGeneratorRecentBatch[]>>({});
    const setNameGeneratorBatches = (storyId: string, batches: NameGeneratorRecentBatch[]) =>
        setNameGeneratorBatchesState(prev => ({ ...prev, [storyId]: batches }));

    const [currentTool, setCurrentToolState] = useState<WorkspaceTool>(() => {
        const storedStoryId = localStorage.getItem(STORAGE_KEY_STORY_ID);
        const stored = localStorage.getItem(STORAGE_KEY_TOOL) as WorkspaceTool;
        // If no story, default to 'stories' tool
        if (!storedStoryId) return "stories";
        // Otherwise use stored or default to 'editor'
        return stored || "editor";
    });

    // Persist currentStoryId to localStorage
    useEffect(() => {
        if (currentStoryId) localStorage.setItem(STORAGE_KEY_STORY_ID, currentStoryId);
        else localStorage.removeItem(STORAGE_KEY_STORY_ID);
    }, [currentStoryId]);

    // Persist currentChapterId to localStorage under a per-story key.
    // Only write, never delete — deletion would erase the key when switching stories.
    useEffect(() => {
        if (!currentStoryId || !currentChapterId) return;
        localStorage.setItem(CHAPTER_KEY(currentStoryId), currentChapterId);
    }, [currentChapterId, currentStoryId]);

    // Persist currentTool to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_TOOL, currentTool);
    }, [currentTool]);

    // Persist chatDrafts to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_CHAT_DRAFTS, JSON.stringify(chatDrafts));
    }, [chatDrafts]);

    const setCurrentChapterId = (chapterId: string | null) => {
        setCurrentChapterIdState(chapterId);
    };

    const setCurrentStoryId = (storyId: string | null) => {
        setCurrentStoryIdState(storyId);
        // Restore the last chapter for the selected story (per-story persistence)
        const restoredChapter = storyId ? localStorage.getItem(CHAPTER_KEY(storyId)) || null : null;
        setCurrentChapterIdState(restoredChapter);
        // When story selected, switch to editor tool
        if (storyId && currentTool === "stories") setCurrentToolState("editor");
        // When story cleared, switch to stories tool
        if (!storyId) setCurrentToolState("stories");
    };

    const setCurrentTool = (tool: WorkspaceTool) => {
        setCurrentToolState(tool);
    };

    const resetContext = () => {
        setCurrentStoryIdState(null);
        setCurrentChapterId(null);
        setCurrentToolState("stories");
    };

    return (
        <StoryContext.Provider
            value={{
                currentStoryId,
                currentChapterId,
                currentTool,
                setCurrentStoryId,
                setCurrentChapterId,
                setCurrentTool,
                resetContext,
                pendingLorebookEntryId,
                setPendingLorebookEntryId,
                pendingLorebookSeed,
                setPendingLorebookSeed,
                pendingChatComposerSeed,
                setPendingChatComposerSeed,
                pendingShuttleSeed,
                setPendingShuttleSeed,
                pendingMapId,
                setPendingMapId,
                pendingMapSketch,
                setPendingMapSketch,
                pendingTimelineFocusPinId,
                setPendingTimelineFocusPinId,
                pendingNoteId,
                setPendingNoteId,
                pendingAiReviewChapterId,
                setPendingAiReviewChapterId,
                chatDrafts,
                setChatDraft,
                chapterContentRefreshToken,
                refreshChapterContent,
                nameGeneratorBatches,
                setNameGeneratorBatches
            }}
        >
            {children}
        </StoryContext.Provider>
    );
}

export function useStoryContext() {
    const context = useContext(StoryContext);
    if (!context) throw new Error("useStoryContext must be used within a StoryProvider");

    return context;
}
