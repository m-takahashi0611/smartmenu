ALTER TABLE `line_users` ADD `isProcessing` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `line_users` ADD `processingStartedAt` timestamp;