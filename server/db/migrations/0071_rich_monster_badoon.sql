CREATE TABLE `autoHumanizerSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'threshold' NOT NULL,
	`aiScoreThreshold` integer DEFAULT 60 NOT NULL,
	`intensity` text DEFAULT 'medium' NOT NULL,
	`tone` text DEFAULT 'casual' NOT NULL,
	`customToneDescription` text DEFAULT '' NOT NULL,
	`minChars` integer DEFAULT 80 NOT NULL,
	`createdAt` integer NOT NULL
);
