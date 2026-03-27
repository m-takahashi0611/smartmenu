CREATE TABLE `delivery_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lineUserId` varchar(64),
	`menuPlanId` int,
	`status` enum('success','failed','skipped') NOT NULL,
	`message` text,
	`errorMessage` text,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyProfileId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`ageGroup` enum('baby','child','teen','adult','senior') NOT NULL,
	`gender` enum('male','female','other') DEFAULT 'other',
	`allergies` text,
	`preferences` text,
	`portionSize` enum('small','normal','large') DEFAULT 'normal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`familyName` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `fridge_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`quantity` varchar(50),
	`expiryDate` date,
	`category` enum('vegetable','meat','fish','dairy','egg','seasoning','frozen','other') DEFAULT 'other',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fridge_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `line_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lineUserId` varchar(64) NOT NULL,
	`displayName` text,
	`pictureUrl` text,
	`deliveryHour` int NOT NULL DEFAULT 7,
	`deliveryMinute` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `line_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_users_lineUserId_unique` UNIQUE(`lineUserId`)
);
--> statement-breakpoint
CREATE TABLE `menu_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planDate` date NOT NULL,
	`breakfast` text,
	`lunch` text,
	`dinner` text,
	`snack` text,
	`generatedPrompt` text,
	`rawResponse` text,
	`isDelivered` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`menuPlanId` int,
	`name` varchar(100) NOT NULL,
	`quantity` varchar(50),
	`category` varchar(50),
	`isChecked` boolean NOT NULL DEFAULT false,
	`listDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopping_list_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`area` varchar(100),
	`saleInfo` text,
	`isMain` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`)
);
