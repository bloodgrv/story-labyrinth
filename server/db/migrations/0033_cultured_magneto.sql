ALTER TABLE `aiChats` ADD `includeNotes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `aiChats` ADD `includeOutline` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `includeInAi` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `outlineItems` ADD `includeInAi` integer DEFAULT false NOT NULL;