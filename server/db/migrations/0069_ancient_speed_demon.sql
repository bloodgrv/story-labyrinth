CREATE TABLE `aiReviewFindings` (
	`id` text PRIMARY KEY NOT NULL,
	`reviewId` text NOT NULL,
	`storyId` text NOT NULL,
	`chapterId` text,
	`tag` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`excerpt` text,
	`excerptStart` integer,
	`excerptEnd` integer,
	`direction` text,
	`status` text DEFAULT 'open' NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`reviewId`) REFERENCES `aiReviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `aireviewfinding_review_id_idx` ON `aiReviewFindings` (`reviewId`);--> statement-breakpoint
CREATE INDEX `aireviewfinding_story_id_idx` ON `aiReviewFindings` (`storyId`);--> statement-breakpoint
CREATE INDEX `aireviewfinding_chapter_id_idx` ON `aiReviewFindings` (`chapterId`);--> statement-breakpoint
CREATE INDEX `aireviewfinding_status_idx` ON `aiReviewFindings` (`status`);--> statement-breakpoint
CREATE TABLE `aiReviews` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`mode` text NOT NULL,
	`chapterIds` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`model` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `aireview_story_id_idx` ON `aiReviews` (`storyId`);--> statement-breakpoint
CREATE INDEX `aireview_status_idx` ON `aiReviews` (`status`);