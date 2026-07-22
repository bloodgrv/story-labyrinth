ALTER TABLE `aiSettings` ADD `contextWindowOverride` integer;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `softWarnNearLimit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `softWarnThreshold` real DEFAULT 0.9 NOT NULL;