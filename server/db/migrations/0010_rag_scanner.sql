CREATE TABLE `ragScanIssues` (
	`id` text PRIMARY KEY NOT NULL,
	`scanId` text NOT NULL,
	`storyId` text NOT NULL,
	`chapterId` text NOT NULL,
	`issueType` text NOT NULL,
	`severity` text NOT NULL,
	`description` text NOT NULL,
	`evidence` text NOT NULL,
	`suggestedFix` text,
	`relatedEntityId` text,
	`status` text DEFAULT 'open' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`scanId`) REFERENCES `ragScans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ragscanissue_scan_id_idx` ON `ragScanIssues` (`scanId`);--> statement-breakpoint
CREATE INDEX `ragscanissue_story_id_idx` ON `ragScanIssues` (`storyId`);--> statement-breakpoint
CREATE INDEX `ragscanissue_chapter_id_idx` ON `ragScanIssues` (`chapterId`);--> statement-breakpoint
CREATE INDEX `ragscanissue_status_idx` ON `ragScanIssues` (`status`);--> statement-breakpoint
CREATE TABLE `ragScans` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`scope` text NOT NULL,
	`chapterId` text,
	`status` text DEFAULT 'running' NOT NULL,
	`totalChapters` integer DEFAULT 0 NOT NULL,
	`processedChapters` integer DEFAULT 0 NOT NULL,
	`model` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`completedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ragscan_story_id_idx` ON `ragScans` (`storyId`);--> statement-breakpoint
CREATE INDEX `ragscan_status_idx` ON `ragScans` (`status`);