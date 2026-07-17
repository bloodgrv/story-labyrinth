CREATE TABLE `agentMemories` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text,
	`memoryKey` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`sourceJobId` text,
	`sourceScanId` text,
	`sourceEvidence` text,
	`pinned` integer DEFAULT false NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`approvedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sourceJobId`) REFERENCES `agentJobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agentmemory_story_id_idx` ON `agentMemories` (`storyId`);--> statement-breakpoint
CREATE INDEX `agentmemory_status_idx` ON `agentMemories` (`status`);--> statement-breakpoint
CREATE INDEX `agentmemory_memory_key_idx` ON `agentMemories` (`memoryKey`);--> statement-breakpoint
CREATE INDEX `agentmemory_story_status_idx` ON `agentMemories` (`storyId`,`status`);--> statement-breakpoint
CREATE INDEX `agentmemory_memory_key_status_idx` ON `agentMemories` (`memoryKey`,`status`);