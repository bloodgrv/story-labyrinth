CREATE TABLE `chapterSnapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`chapterId` text NOT NULL,
	`content` text NOT NULL,
	`sourceType` text NOT NULL,
	`sourceRef` text,
	`label` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_snapshot_chapter_id_idx` ON `chapterSnapshots` (`chapterId`);--> statement-breakpoint
CREATE INDEX `chapter_snapshot_created_at_idx` ON `chapterSnapshots` (`createdAt`);