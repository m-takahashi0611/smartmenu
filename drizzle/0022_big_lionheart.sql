ALTER TABLE `menu_plans` ADD `actualMealBreakfast` varchar(200);--> statement-breakpoint
ALTER TABLE `menu_plans` ADD `actualMealLunch` varchar(200);--> statement-breakpoint
ALTER TABLE `menu_plans` ADD `actualMealDinner` varchar(200);--> statement-breakpoint
ALTER TABLE `menu_plans` ADD `actualStatusBreakfast` enum('cooked','other','eating_out','not_eaten','skipped');--> statement-breakpoint
ALTER TABLE `menu_plans` ADD `actualStatusLunch` enum('cooked','other','eating_out','not_eaten','skipped');--> statement-breakpoint
ALTER TABLE `menu_plans` ADD `actualStatusDinner` enum('cooked','other','eating_out','not_eaten','skipped');