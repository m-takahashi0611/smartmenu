CREATE TABLE `line_conversation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(64) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `line_conversation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `line_users` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `line_users` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `line_users` ADD `region` varchar(100);