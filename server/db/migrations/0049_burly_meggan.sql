CREATE TABLE `nameFavorites` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`name` text NOT NULL,
	`nameType` text NOT NULL,
	`poolId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`poolId`) REFERENCES `namePools`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `namefavorite_story_id_idx` ON `nameFavorites` (`storyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `namefavorite_story_name_type_unique_idx` ON `nameFavorites` (`storyId`,`name`,`nameType`);