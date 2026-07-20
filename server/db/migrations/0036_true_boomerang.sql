CREATE TABLE `brainstormChecklist` (
	`id` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`storyId` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`sourceMessageId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`chatId`) REFERENCES `aiChats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brainstormchecklist_chat_id_idx` ON `brainstormChecklist` (`chatId`);--> statement-breakpoint
CREATE INDEX `brainstormchecklist_status_idx` ON `brainstormChecklist` (`status`);--> statement-breakpoint
CREATE TABLE `brainstormSlots` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`slotKey` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brainstormslot_story_id_idx` ON `brainstormSlots` (`storyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `brainstormslot_story_slot_idx` ON `brainstormSlots` (`storyId`,`slotKey`);--> statement-breakpoint
ALTER TABLE `aiChats` ADD `includeLorebook` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `includeChapterSummaries` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `brainstormStyle` text DEFAULT 'standard' NOT NULL;