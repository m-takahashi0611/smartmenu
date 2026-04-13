ALTER TABLE `line_users` ADD `isBlocked` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `line_users` ADD `blockedAt` timestamp;