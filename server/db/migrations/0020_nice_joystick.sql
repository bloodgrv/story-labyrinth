ALTER TABLE `aiSettings` ADD `grokOAuthAccessToken` text;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `grokOAuthRefreshToken` text;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `grokOAuthExpiresAt` integer;--> statement-breakpoint
ALTER TABLE `aiSettings` ADD `defaultGrokOAuthModel` text;