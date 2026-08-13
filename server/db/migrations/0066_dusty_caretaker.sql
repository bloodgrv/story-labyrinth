CREATE TABLE `storyTimelineSuggestSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`includeSynopsis` integer DEFAULT true NOT NULL,
	`includeNotes` integer DEFAULT true NOT NULL,
	`includeCategoriesJson` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storyTimelineSuggestSettings_storyId_unique` ON `storyTimelineSuggestSettings` (`storyId`);