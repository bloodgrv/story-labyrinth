CREATE TABLE `storyGraphEdges` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`fromId` text NOT NULL,
	`toId` text NOT NULL,
	`edgeType` text NOT NULL,
	`label` text,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`asOfChapterId` text,
	`source` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storygraphedge_story_id_idx` ON `storyGraphEdges` (`storyId`);--> statement-breakpoint
CREATE INDEX `storygraphedge_from_id_idx` ON `storyGraphEdges` (`fromId`);--> statement-breakpoint
CREATE INDEX `storygraphedge_to_id_idx` ON `storyGraphEdges` (`toId`);--> statement-breakpoint
CREATE INDEX `storygraphedge_story_edge_type_idx` ON `storyGraphEdges` (`storyId`,`edgeType`);--> statement-breakpoint
CREATE INDEX `storygraphedge_status_idx` ON `storyGraphEdges` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `storygraphedge_unique_active_idx` ON `storyGraphEdges` (`storyId`,`fromId`,`toId`,`edgeType`) WHERE status = 'active';