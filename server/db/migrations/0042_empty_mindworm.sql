CREATE TABLE `orgFolders` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`level` text,
	`scopeId` text,
	`category` text,
	`chatType` text,
	`parentId` text,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orgfolder_kind_idx` ON `orgFolders` (`kind`);--> statement-breakpoint
CREATE INDEX `orgfolder_scope_idx` ON `orgFolders` (`kind`,`scopeId`);--> statement-breakpoint
CREATE INDEX `orgfolder_parent_id_idx` ON `orgFolders` (`parentId`);--> statement-breakpoint
ALTER TABLE `aiChats` ADD `folderId` text;--> statement-breakpoint
ALTER TABLE `lorebookEntries` ADD `folderId` text;