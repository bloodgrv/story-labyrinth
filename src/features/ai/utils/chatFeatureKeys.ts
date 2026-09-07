import type { AIChat, Prompt } from "@/types/story";
import type { FeatureKey } from "@/types/aiSettings";

// Every chat type with its own Feature Routing row (see src/types/aiSettings.ts's FEATURE_KEYS).
// A chat's `chatType` and its prompt's `promptType` use the same string values, so one map serves
// both callers: useChatSystemPrompt.ts (which model to default to) and useChatMessageGeneration.ts
// (which feature's endpoint credentials the server should use — B45).
const CHAT_FEATURE_KEYS: Partial<Record<string, FeatureKey>> = {
    worldbuilding: "worldbuilding_chat",
    editor: "editor_chat",
    brainstorm: "brainstorm_chat",
    outline: "outline_chat",
    notes: "notes_chat",
    research: "research_chat"
};

export const featureKeyForChatType = (
    chatType: AIChat["chatType"] | Prompt["promptType"] | null | undefined
): FeatureKey | undefined => (chatType ? CHAT_FEATURE_KEYS[chatType] : undefined);
