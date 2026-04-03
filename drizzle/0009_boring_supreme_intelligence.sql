CREATE TABLE `menu_themes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(64) NOT NULL,
	`rawInput` text NOT NULL,
	`mainDish` varchar(50),
	`noodleType` varchar(50),
	`cuisine` varchar(50),
	`flavor` varchar(100),
	`texture` varchar(50),
	`cookingMethod` varchar(50),
	`scene` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `menu_themes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(64) NOT NULL,
	`memberName` varchar(50),
	`preferenceType` enum('dislike','allergy','favorite','restriction') NOT NULL,
	`ingredient` varchar(100) NOT NULL,
	`note` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`)
);
