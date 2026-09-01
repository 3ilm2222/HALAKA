CREATE TABLE `teacher_access` (
	`id` int NOT NULL,
	`teacherId` int NOT NULL,
	`pinHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_access_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teacher_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_sessions_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `monthly_boards` ADD `themeJson` longtext;--> statement-breakpoint
CREATE INDEX `teacher_sessions_teacher_idx` ON `teacher_sessions` (`teacherId`);