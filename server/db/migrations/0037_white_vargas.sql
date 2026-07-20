ALTER TABLE `aiChats` ADD `wbStyle` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `outlineStyle` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `includePsychModule` integer DEFAULT false NOT NULL;