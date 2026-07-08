ALTER TABLE `concreteBeats` ADD `characterId` text REFERENCES lorebookEntries(id);--> statement-breakpoint
CREATE INDEX `concretebeat_character_id_idx` ON `concreteBeats` (`characterId`);