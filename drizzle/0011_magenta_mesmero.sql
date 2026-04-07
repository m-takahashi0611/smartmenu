CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`plan` enum('free','premium') NOT NULL DEFAULT 'free',
	`status` enum('trial','active','cancelled','expired') NOT NULL DEFAULT 'trial',
	`trialStartedAt` timestamp NOT NULL DEFAULT (now()),
	`trialDays` int NOT NULL DEFAULT 45,
	`campaignCode` varchar(50),
	`stripeCustomerId` varchar(100),
	`stripeSubscriptionId` varchar(100),
	`currentPeriodEnd` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
