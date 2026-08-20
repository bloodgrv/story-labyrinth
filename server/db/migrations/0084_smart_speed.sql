CREATE TABLE `mcpServerSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`tokenHash` text,
	`tokenCreatedAt` integer,
	`updatedAt` integer NOT NULL
);
