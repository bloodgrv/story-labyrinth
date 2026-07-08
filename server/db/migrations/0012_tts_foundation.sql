CREATE TABLE `ttsSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`activeProvider` text DEFAULT 'speechify' NOT NULL,
	`providers` text NOT NULL,
	`createdAt` integer NOT NULL
);
