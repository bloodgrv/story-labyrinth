ALTER TABLE `aiChats` ADD `chatType` text;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `templateSlug` text;--> statement-breakpoint
CREATE INDEX `chat_type_idx` ON `aiChats` (`chatType`);
