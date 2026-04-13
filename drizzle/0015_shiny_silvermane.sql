ALTER TABLE `user_base_themes` RENAME COLUMN `healthTheme` TO `healthThemes`;--> statement-breakpoint
ALTER TABLE `user_base_themes` RENAME COLUMN `lifestageTheme` TO `lifestageThemes`;--> statement-breakpoint
ALTER TABLE `user_base_themes` MODIFY COLUMN `healthThemes` varchar(255);--> statement-breakpoint
ALTER TABLE `user_base_themes` MODIFY COLUMN `lifestageThemes` varchar(255);