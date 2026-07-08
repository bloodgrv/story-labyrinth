CREATE TABLE `outlineItemCharacters` (
	`id` text PRIMARY KEY NOT NULL,
	`outlineItemId` text NOT NULL,
	`storyId` text NOT NULL,
	`characterId` text NOT NULL,
	`arcNote` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`outlineItemId`) REFERENCES `outlineItems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`characterId`) REFERENCES `lorebookEntries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outlineitemchar_outline_item_id_idx` ON `outlineItemCharacters` (`outlineItemId`);--> statement-breakpoint
CREATE INDEX `outlineitemchar_story_id_idx` ON `outlineItemCharacters` (`storyId`);--> statement-breakpoint
CREATE INDEX `outlineitemchar_character_id_idx` ON `outlineItemCharacters` (`characterId`);--> statement-breakpoint
CREATE TABLE `outlineItems` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`parentId` text,
	`type` text DEFAULT 'scene' NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`wordCountTarget` integer,
	`order` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`chapterId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outlineitem_story_id_idx` ON `outlineItems` (`storyId`);--> statement-breakpoint
CREATE INDEX `outlineitem_parent_id_idx` ON `outlineItems` (`parentId`);--> statement-breakpoint
CREATE INDEX `outlineitem_status_idx` ON `outlineItems` (`status`);