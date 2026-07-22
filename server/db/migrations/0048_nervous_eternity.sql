CREATE TABLE `namePoolNames` (
	`id` text PRIMARY KEY NOT NULL,
	`poolId` text NOT NULL,
	`name` text NOT NULL,
	`tier` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`poolId`) REFERENCES `namePools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `namepoolname_pool_id_idx` ON `namePoolNames` (`poolId`);--> statement-breakpoint
CREATE INDEX `namepoolname_pool_tier_idx` ON `namePoolNames` (`poolId`,`tier`);--> statement-breakpoint
CREATE UNIQUE INDEX `namepoolname_pool_name_unique_idx` ON `namePoolNames` (`poolId`,`name`);--> statement-breakpoint
CREATE TABLE `namePools` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'global' NOT NULL,
	`scopeId` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`gender` text,
	`region` text NOT NULL,
	`eraStart` integer,
	`eraEnd` integer,
	`source` text DEFAULT 'core' NOT NULL,
	`isBakedIn` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `namepool_level_scope_idx` ON `namePools` (`level`,`scopeId`);--> statement-breakpoint
CREATE INDEX `namepool_kind_idx` ON `namePools` (`kind`);--> statement-breakpoint
CREATE INDEX `namepool_kind_gender_region_idx` ON `namePools` (`kind`,`gender`,`region`);--> statement-breakpoint
CREATE TABLE `storyNameDefaults` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`era` text,
	`region` text,
	`gender` text,
	`favoritePoolIds` text,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storynamedefaults_story_id_unique_idx` ON `storyNameDefaults` (`storyId`);--> statement-breakpoint
CREATE TABLE `usedNames` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`name` text NOT NULL,
	`nameType` text NOT NULL,
	`source` text NOT NULL,
	`poolNameId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`poolNameId`) REFERENCES `namePoolNames`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usedname_story_id_idx` ON `usedNames` (`storyId`);--> statement-breakpoint
CREATE INDEX `usedname_story_name_type_idx` ON `usedNames` (`storyId`,`nameType`);--> statement-breakpoint
CREATE UNIQUE INDEX `usedname_story_name_type_unique_idx` ON `usedNames` (`storyId`,`name`,`nameType`);