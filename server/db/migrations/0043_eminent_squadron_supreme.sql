CREATE TABLE `storyGraphLayout` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`nodeId` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storygraphlayout_story_id_idx` ON `storyGraphLayout` (`storyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `storygraphlayout_unique_node_idx` ON `storyGraphLayout` (`storyId`,`nodeId`);