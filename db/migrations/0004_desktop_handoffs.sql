CREATE TABLE `desktop_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desktop_handoffs_code_hash_unique` ON `desktop_handoffs` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `desktop_handoffs_owner_idx` ON `desktop_handoffs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `desktop_handoffs_expiry_idx` ON `desktop_handoffs` (`expires_at`);
--> statement-breakpoint
PRAGMA optimize;
