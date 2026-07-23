CREATE TABLE `storyMapEdges` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`fromId` text NOT NULL,
	`toId` text NOT NULL,
	`edgeType` text NOT NULL,
	`label` text,
	`description` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storymapedge_story_id_idx` ON `storyMapEdges` (`storyId`);--> statement-breakpoint
CREATE INDEX `storymapedge_from_id_idx` ON `storyMapEdges` (`fromId`);--> statement-breakpoint
CREATE INDEX `storymapedge_to_id_idx` ON `storyMapEdges` (`toId`);--> statement-breakpoint
CREATE UNIQUE INDEX `storymapedge_unique_idx` ON `storyMapEdges` (`storyId`,`fromId`,`toId`,`edgeType`);--> statement-breakpoint
CREATE TABLE `storyMapLayout` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`nodeId` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storymaplayout_story_id_idx` ON `storyMapLayout` (`storyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `storymaplayout_unique_node_idx` ON `storyMapLayout` (`storyId`,`nodeId`);