ALTER TABLE `storyTimelinePins` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `storyTimelinePins` ADD `source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX `storytimelinepins_status_idx` ON `storyTimelinePins` (`status`);