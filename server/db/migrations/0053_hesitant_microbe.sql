CREATE TABLE `playbookPacks` (
	`id` text PRIMARY KEY NOT NULL,
	`playbookKey` text NOT NULL,
	`style` text NOT NULL,
	`packScope` text NOT NULL,
	`storyId` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`sourcePackId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playbookpack_story_id_idx` ON `playbookPacks` (`storyId`);--> statement-breakpoint
CREATE INDEX `playbookpack_scope_idx` ON `playbookPacks` (`packScope`);--> statement-breakpoint
CREATE INDEX `playbookpack_key_style_idx` ON `playbookPacks` (`playbookKey`,`style`);--> statement-breakpoint
ALTER TABLE `aiChats` ADD `usePlaybookPack` integer DEFAULT false NOT NULL;