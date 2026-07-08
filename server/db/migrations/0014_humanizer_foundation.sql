CREATE TABLE `humanizerSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`intensity` text DEFAULT 'medium' NOT NULL,
	`createdAt` integer NOT NULL
);
