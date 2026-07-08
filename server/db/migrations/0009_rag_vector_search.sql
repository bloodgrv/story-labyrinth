CREATE TABLE `ragChunks` (
	`id` text PRIMARY KEY NOT NULL,
	`storyId` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`chunkIndex` integer NOT NULL,
	`content` text NOT NULL,
	`contentHash` text NOT NULL,
	`embeddingModel` text,
	`embeddedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ragchunk_story_id_idx` ON `ragChunks` (`storyId`);--> statement-breakpoint
CREATE INDEX `ragchunk_entity_idx` ON `ragChunks` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `ragchunk_content_hash_idx` ON `ragChunks` (`contentHash`);--> statement-breakpoint
-- sqlite-vec virtual table: vector similarity search, pre-filterable by storyId, joined back to
-- ragChunks via the chunkId auxiliary column. Embedding dimension is fixed at create time (768) —
-- see server/services/embeddingService.ts EMBEDDING_DIMENSIONS. Changing embedding models to a
-- different dimension requires a new migration to drop and recreate this table.
CREATE VIRTUAL TABLE `vec_chunks` USING vec0(
	storyId TEXT PARTITION KEY,
	embedding float[768],
	+chunkId TEXT
);--> statement-breakpoint
-- FTS5 virtual table: keyword search, standalone (not external-content) so it is not tied to
-- ragChunks' rowid — kept in sync manually alongside vec_chunks via chunkId.
CREATE VIRTUAL TABLE `fts_chunks` USING fts5(
	content,
	chunkId UNINDEXED,
	storyId UNINDEXED
);