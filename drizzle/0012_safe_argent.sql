CREATE TABLE `bento_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`dayMode` enum('everyday','weekday','custom') NOT NULL DEFAULT 'weekday',
	`customDays` text,
	`prepEvening` boolean NOT NULL DEFAULT true,
	`selectedMembers` text,
	`boxSizes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bento_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bento_settings_userId_unique` UNIQUE(`userId`)
);
