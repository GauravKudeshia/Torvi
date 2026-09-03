CREATE TABLE `session_documents` (
	`session_id` text NOT NULL,
	`document_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_documents_unique_idx` ON `session_documents` (`session_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `session_documents_document_idx` ON `session_documents` (`document_id`,`session_id`);