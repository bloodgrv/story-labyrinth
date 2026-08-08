ALTER TABLE `notes` ADD `folderId` text;--> statement-breakpoint
ALTER TABLE `notes` ADD `tags` text;--> statement-breakpoint
CREATE INDEX `note_folder_id_idx` ON `notes` (`folderId`);