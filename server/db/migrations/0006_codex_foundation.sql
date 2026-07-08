ALTER TABLE `lorebookEntries` ADD `codexEnabled` integer;--> statement-breakpoint
ALTER TABLE `lorebookEntries` ADD `needsFleshingOut` integer;--> statement-breakpoint
ALTER TABLE `lorebookEntries` ADD `codexState` text;--> statement-breakpoint
ALTER TABLE `lorebookEntries` ADD `updatedAt` integer;--> statement-breakpoint
CREATE TABLE `codexSnapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`entryId` text NOT NULL,
	`description` text NOT NULL,
	`codexState` text,
	`sourceType` text NOT NULL,
	`sourceRef` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`entryId`) REFERENCES `lorebookEntries`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `snapshot_entry_id_idx` ON `codexSnapshots` (`entryId`);--> statement-breakpoint
CREATE INDEX `snapshot_created_at_idx` ON `codexSnapshots` (`createdAt`);--> statement-breakpoint
CREATE TABLE `codexPendingChanges` (
	`id` text PRIMARY KEY NOT NULL,
	`entryId` text NOT NULL,
	`proposedDescription` text,
	`proposedState` text,
	`proposedTags` text,
	`proposedNeedsFleshingOut` integer,
	`sourceType` text NOT NULL,
	`sourceRef` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer NOT NULL,
	`resolvedAt` integer,
	FOREIGN KEY (`entryId`) REFERENCES `lorebookEntries`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `pending_entry_id_idx` ON `codexPendingChanges` (`entryId`);--> statement-breakpoint
CREATE INDEX `pending_status_idx` ON `codexPendingChanges` (`status`);--> statement-breakpoint
CREATE INDEX `pending_entry_status_idx` ON `codexPendingChanges` (`entryId`, `status`);
