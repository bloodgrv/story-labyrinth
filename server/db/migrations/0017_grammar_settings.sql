CREATE TABLE `grammarSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`serverUrl` text DEFAULT 'http://localhost:8010' NOT NULL,
	`language` text DEFAULT 'auto' NOT NULL,
	`createdAt` integer NOT NULL
);
