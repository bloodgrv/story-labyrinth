CREATE TABLE `concreteBeats` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`chapterId` text NOT NULL,
	`beatType` text NOT NULL,
	`text` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concretebeat_story_id_idx` ON `concreteBeats` (`storyId`);--> statement-breakpoint
CREATE INDEX `concretebeat_chapter_id_idx` ON `concreteBeats` (`chapterId`);