ALTER TABLE `aiChats` ADD `anchorChapterId` text;--> statement-breakpoint
CREATE INDEX `chat_anchor_chapter_id_idx` ON `aiChats` (`anchorChapterId`);