ALTER TABLE `users` ADD `role` text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` integer DEFAULT true NOT NULL;