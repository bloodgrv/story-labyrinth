CREATE TABLE `mcpConnections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text DEFAULT 'streamable_http' NOT NULL,
	`url` text NOT NULL,
	`bearerToken` text,
	`allowPrivateNetwork` integer DEFAULT false NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`storyId` text,
	`enabled` integer DEFAULT false NOT NULL,
	`toolsCatalogue` text DEFAULT '[]' NOT NULL,
	`lastToolsFetch` integer,
	`lastToolsError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`deletedAt` integer,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcpconnection_scope_idx` ON `mcpConnections` (`scope`);--> statement-breakpoint
CREATE INDEX `mcpconnection_story_id_idx` ON `mcpConnections` (`storyId`);