CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`senderRole` enum('teacher','parent') NOT NULL,
	`content` text NOT NULL,
	`isNote` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_boards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`label` varchar(40) NOT NULL,
	`elementsJson` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_boards_id` PRIMARY KEY(`id`),
	CONSTRAINT `boards_student_month_unique` UNIQUE(`studentId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `parent_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`pushToken` varchar(255),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parent_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `parent_sessions_token_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`normalizedName` varchar(160) NOT NULL,
	`age` int NOT NULL,
	`parentPinHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `messages_student_created_idx` ON `messages` (`studentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `boards_student_idx` ON `monthly_boards` (`studentId`);--> statement-breakpoint
CREATE INDEX `parent_sessions_student_idx` ON `parent_sessions` (`studentId`);--> statement-breakpoint
CREATE INDEX `students_teacher_idx` ON `students` (`teacherId`);--> statement-breakpoint
CREATE INDEX `students_parent_lookup_idx` ON `students` (`normalizedName`);