ALTER TABLE `aiChats` ADD `anchorEntryId` text;--> statement-breakpoint
CREATE INDEX `chat_anchor_entry_id_idx` ON `aiChats` (`anchorEntryId`);