CREATE TABLE `chapterVersions` (
	`id` text PRIMARY KEY NOT NULL,
	`chapterId` text NOT NULL,
	`content` text NOT NULL,
	`sourceType` text NOT NULL,
	`label` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_version_chapter_id_idx` ON `chapterVersions` (`chapterId`);--> statement-breakpoint
CREATE INDEX `chapter_version_created_at_idx` ON `chapterVersions` (`createdAt`);