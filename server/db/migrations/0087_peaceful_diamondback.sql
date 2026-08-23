ALTER TABLE `lorebookEntries` ADD `manualOrder` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE lorebookEntries
SET manualOrder = (
    SELECT ranked.rn FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY level, scopeId, category, folderId
            ORDER BY name ASC, id ASC
        ) AS rn
        FROM lorebookEntries
    ) ranked
    WHERE ranked.id = lorebookEntries.id
);