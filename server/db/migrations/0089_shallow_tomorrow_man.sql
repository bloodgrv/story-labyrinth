CREATE TABLE `loginAttempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failedCount` integer DEFAULT 0 NOT NULL,
	`lockedUntil` integer,
	`updatedAt` integer NOT NULL
);
