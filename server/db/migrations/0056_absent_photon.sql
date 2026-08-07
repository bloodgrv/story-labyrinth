CREATE TABLE `storyMaps` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`title` text NOT NULL,
	`locationId` text,
	`sceneJson` text NOT NULL,
	`thumbnailFilename` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storymaps_story_id_idx` ON `storyMaps` (`storyId`);--> statement-breakpoint
CREATE INDEX `storymaps_location_id_idx` ON `storyMaps` (`locationId`);