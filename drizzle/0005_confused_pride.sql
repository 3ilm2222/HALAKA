CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`dateKey` varchar(10) NOT NULL,
	`morningAbsent` boolean NOT NULL DEFAULT false,
	`eveningAbsent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_student_date_unique` UNIQUE(`studentId`,`dateKey`)
);
--> statement-breakpoint
CREATE INDEX `attendance_student_date_idx` ON `attendance` (`studentId`,`dateKey`);