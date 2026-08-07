CREATE TABLE `storyTimelineMemberships` (
	`id` text PRIMARY KEY NOT NULL,
	`timelineId` text NOT NULL,
	`pinId` text NOT NULL,
	`laneId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`timelineId`) REFERENCES `storyTimelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pinId`) REFERENCES `storyTimelinePins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storytimelinememberships_unique_idx` ON `storyTimelineMemberships` (`timelineId`,`pinId`);--> statement-breakpoint
CREATE INDEX `storytimelinememberships_timeline_id_idx` ON `storyTimelineMemberships` (`timelineId`);--> statement-breakpoint
CREATE INDEX `storytimelinememberships_pin_id_idx` ON `storyTimelineMemberships` (`pinId`);--> statement-breakpoint
CREATE TABLE `storyTimelinePins` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`title` text NOT NULL,
	`blurb` text,
	`whenKind` text DEFAULT 'fuzzy' NOT NULL,
	`relativeOffsetYears` real,
	`fuzzyPhrase` text,
	`civilDate` text,
	`manualOrder` integer DEFAULT 0 NOT NULL,
	`linkType` text,
	`linkId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storytimelinepins_story_id_idx` ON `storyTimelinePins` (`storyId`);--> statement-breakpoint
CREATE INDEX `storytimelinepins_link_idx` ON `storyTimelinePins` (`linkType`,`linkId`);--> statement-breakpoint
CREATE TABLE `storyTimelines` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`title` text NOT NULL,
	`isDefault` integer DEFAULT false NOT NULL,
	`orientation` text DEFAULT 'horizontal' NOT NULL,
	`storyStartMode` text DEFAULT 'chapter_one' NOT NULL,
	`storyStartChapterId` text,
	`storyStartPinId` text,
	`storyStartManualWhenJson` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storytimelines_story_id_idx` ON `storyTimelines` (`storyId`);