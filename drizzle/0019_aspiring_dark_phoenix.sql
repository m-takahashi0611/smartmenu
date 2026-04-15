CREATE TABLE `error_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(100) NOT NULL,
	`message` text NOT NULL,
	`userAgent` text,
	`userId` int,
	`lineUserId` varchar(64),
	`extra` json,
	`notifiedOwner` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_logs_id` PRIMARY KEY(`id`)
);
