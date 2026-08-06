import { chaptersApi } from "@/services/api/client";
import type { PromptContext, PromptParserConfig } from "@/types/story";

export class ContextBuilder {
    async buildContext(config: PromptParserConfig): Promise<PromptContext> {
        // Global (storyId-less) chats — e.g. Research's Global mode — have no story to list
        // chapters for. Without this guard, config.storyId === "" produced a GET /chapters/story/
        // request that Express's trailing-slash-insensitive routing matched against /:id instead
        // (id="story"), surfacing as a confusing "Chapter not found" 404 on every message send.
        const [chapters, currentChapter] = await Promise.all([
            config.storyId ? chaptersApi.getByStory(config.storyId) : Promise.resolve([]),
            config.chapterId ? chaptersApi.getById(config.chapterId) : Promise.resolve(undefined)
        ]);

        return {
            ...config,
            chapters,
            currentChapter,
            povCharacter: config.povCharacter || currentChapter?.povCharacter,
            povType: config.povType || currentChapter?.povType || "Third Person Omniscient",
            additionalContext: config.additionalContext || {}
        };
    }
}
