CREATE TABLE `daily_cloud_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`backupDate` varchar(10) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_cloud_backups_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_cloud_backups_teacher_date_unique` UNIQUE(`teacherId`,`backupDate`)
);
--> statement-breakpoint
ALTER TABLE `teacher_access` ADD `googleOpenId` varchar(64);--> statement-breakpoint
CREATE INDEX `daily_cloud_backups_teacher_created_idx` ON `daily_cloud_backups` (`teacherId`,`createdAt`);