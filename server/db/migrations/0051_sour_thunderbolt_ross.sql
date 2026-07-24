CREATE TABLE `outlineImportBatches` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`status` text DEFAULT 'extracting' NOT NULL,
	`sourceFilename` text NOT NULL,
	`mode` text DEFAULT 'append' NOT NULL,
	`includeInAiArm` integer DEFAULT false NOT NULL,
	`structureDraft` text NOT NULL,
	`chatId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outlineimportbatch_story_id_idx` ON `outlineImportBatches` (`storyId`);--> statement-breakpoint
CREATE INDEX `outlineimportbatch_status_idx` ON `outlineImportBatches` (`status`);--> statement-breakpoint
CREATE TABLE `outlineImportChecklist` (
	`id` text PRIMARY KEY NOT NULL,
	`batchId` text NOT NULL,
	`storyId` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`batchId`) REFERENCES `outlineImportBatches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outlineimportchecklist_batch_id_idx` ON `outlineImportChecklist` (`batchId`);--> statement-breakpoint
CREATE INDEX `outlineimportchecklist_story_id_idx` ON `outlineImportChecklist` (`storyId`);--> statement-breakpoint
CREATE INDEX `outlineimportchecklist_status_idx` ON `outlineImportChecklist` (`status`);