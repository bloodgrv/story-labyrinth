ALTER TABLE `aiSettings` ADD `localInjectEnabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `localInjectBody` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `localInjectActivePresetId` text;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `localInjectPresets` text DEFAULT '[]' NOT NULL;