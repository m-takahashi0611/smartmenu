ALTER TABLE `family_profiles` ADD `shoppingDays` json;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `breakfastCookCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `lunchCookCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `dinnerCookCount` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `breakfastAttendees` json;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `lunchAttendees` json;--> statement-breakpoint
ALTER TABLE `family_profiles` ADD `dinnerAttendees` json;