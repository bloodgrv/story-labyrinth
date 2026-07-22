CREATE TABLE `deskTransfers` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`event` text NOT NULL,
	`kind` text NOT NULL,
	`fromDesk` text NOT NULL,
	`fromChatId` text,
	`fromChatTitleSnapshot` text,
	`toDesk` text NOT NULL,
	`toChatId` text,
	`toChatTitleSnapshot` text,
	`subject` text NOT NULL,
	`crumb` text,
	`sourceChecklistItemId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `desktransfer_story_id_idx` ON `deskTransfers` (`storyId`);--> statement-breakpoint
CREATE INDEX `desktransfer_story_created_at_idx` ON `deskTransfers` (`storyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `desktransfer_created_at_idx` ON `deskTransfers` (`createdAt`);