ALTER TABLE `sessions` ADD `lastSeenAt` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `remoteProfile` integer DEFAULT false NOT NULL;