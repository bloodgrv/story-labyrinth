CREATE TABLE `agentJobs` (
	`id` text PRIMARY KEY NOT NULL,
	`jobType` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`storyId` text,
	`entityId` text,
	`payload` text,
	`result` text,
	`progress` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 3 NOT NULL,
	`error` text,
	`createdAt` integer NOT NULL,
	`queuedAt` integer NOT NULL,
	`startedAt` integer,
	`completedAt` integer,
	`lastAttemptAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentjob_status_idx` ON `agentJobs` (`status`);--> statement-breakpoint
CREATE INDEX `agentjob_story_id_idx` ON `agentJobs` (`storyId`);--> statement-breakpoint
CREATE INDEX `agentjob_job_type_status_idx` ON `agentJobs` (`jobType`,`status`);--> statement-breakpoint
CREATE INDEX `agentjob_dedup_lookup_idx` ON `agentJobs` (`jobType`,`storyId`,`entityId`,`status`);