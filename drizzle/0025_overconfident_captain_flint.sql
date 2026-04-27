ALTER TABLE `broadcast_messages` ADD `mediaType` enum('none','image','video','youtube') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcast_messages` ADD `mediaUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `broadcast_messages` ADD `mediaThumbnailUrl` varchar(2048);