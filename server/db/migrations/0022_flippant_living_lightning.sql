PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_aiChats` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	`lastUsedPromptId` text,
	`lastUsedModelId` text,
	`isDemo` integer,
	`chatType` text,
	`templateSlug` text,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_aiChats`("id", "storyId", "title", "messages", "createdAt", "updatedAt", "lastUsedPromptId", "lastUsedModelId", "isDemo", "chatType", "templateSlug") SELECT "id", "storyId", "title", "messages", "createdAt", "updatedAt", "lastUsedPromptId", "lastUsedModelId", "isDemo", "chatType", "templateSlug" FROM `aiChats`;--> statement-breakpoint
DROP TABLE `aiChats`;--> statement-breakpoint
ALTER TABLE `__new_aiChats` RENAME TO `aiChats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_story_id_idx` ON `aiChats` (`storyId`);--> statement-breakpoint
CREATE INDEX `chat_type_idx` ON `aiChats` (`chatType`);