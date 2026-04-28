CREATE TABLE `weekly_special_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`type` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_special_days_id` PRIMARY KEY(`id`)
);
