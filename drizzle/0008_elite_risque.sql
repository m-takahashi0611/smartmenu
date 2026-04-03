CREATE TABLE `product_name_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`normalizedName` varchar(100) NOT NULL,
	`category` varchar(50),
	`resolvedBy` enum('rule','llm') NOT NULL DEFAULT 'llm',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_name_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_name_cache_originalName_unique` UNIQUE(`originalName`)
);
