CREATE TABLE `storyTtsPreferences` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`provider` text NOT NULL,
	`voiceId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storyTtsPreferences_storyId_unique` ON `storyTtsPreferences` (`storyId`);--> statement-breakpoint
ALTER TABLE `ttsSettings` ADD `availableVoices` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `ttsSettings` ADD `lastVoicesFetch` integer;