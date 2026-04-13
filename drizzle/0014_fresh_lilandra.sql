CREATE TABLE `user_base_themes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`healthTheme` varchar(50),
	`lifestageTheme` varchar(50),
	`economyTheme` varchar(50),
	`styleTheme` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_base_themes_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_base_themes_userId_unique` UNIQUE(`userId`)
);
