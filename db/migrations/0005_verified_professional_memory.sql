CREATE TABLE `professional_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_document_id` text,
	`title` text NOT NULL,
	`company` text,
	`role` text,
	`start_date` text,
	`end_date` text,
	`context` text,
	`summary` text,
	`responsibilities_json` text DEFAULT '[]' NOT NULL,
	`technologies_json` text DEFAULT '[]' NOT NULL,
	`projects_json` text DEFAULT '[]' NOT NULL,
	`decisions_json` text DEFAULT '[]' NOT NULL,
	`challenges_json` text DEFAULT '[]' NOT NULL,
	`tradeoffs_json` text DEFAULT '[]' NOT NULL,
	`outcomes_json` text DEFAULT '[]' NOT NULL,
	`metrics_json` text DEFAULT '[]' NOT NULL,
	`competencies_json` text DEFAULT '[]' NOT NULL,
	`leadership_examples_json` text DEFAULT '[]' NOT NULL,
	`collaboration_examples_json` text DEFAULT '[]' NOT NULL,
	`conflict_examples_json` text DEFAULT '[]' NOT NULL,
	`learning_examples_json` text DEFAULT '[]' NOT NULL,
	`verification_status` text DEFAULT 'proposed' NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`sensitive` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `professional_experiences_owner_idx` ON `professional_experiences` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `professional_experiences_source_idx` ON `professional_experiences` (`source_document_id`);
--> statement-breakpoint
CREATE TABLE `professional_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text,
	`user_id` text NOT NULL,
	`claim_text` text NOT NULL,
	`claim_type` text DEFAULT 'other' NOT NULL,
	`knowledge_class` text DEFAULT 'VERIFIED_PERSONAL_FACT' NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`source_excerpt` text,
	`source_location` text,
	`verification_status` text DEFAULT 'proposed' NOT NULL,
	`verified_at` integer,
	`user_correction` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`allowed_as_personal_experience` integer DEFAULT false NOT NULL,
	`sensitive` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `professional_experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `professional_claims_owner_status_idx` ON `professional_claims` (`user_id`,`verification_status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `professional_claims_experience_idx` ON `professional_claims` (`experience_id`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_claims_source_text_idx` ON `professional_claims` (`user_id`,`source_type`,`source_id`,`claim_text`);
--> statement-breakpoint
CREATE TABLE `claim_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`excerpt` text,
	`location` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `professional_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_evidence_claim_idx` ON `claim_evidence` (`claim_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `claim_evidence_owner_idx` ON `claim_evidence` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `communication_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferred_answer_length` text DEFAULT 'concise' NOT NULL,
	`technical_depth` text DEFAULT 'balanced' NOT NULL,
	`tone` text DEFAULT 'conversational' NOT NULL,
	`first_person_style` text DEFAULT 'direct' NOT NULL,
	`bullet_preference` text DEFAULT 'progressive' NOT NULL,
	`explanation_depth` text DEFAULT 'adaptive' NOT NULL,
	`vocabulary_preferences_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `interview_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_target_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`outcome` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_target_id`) REFERENCES `job_targets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `interview_processes_owner_idx` ON `interview_processes` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `interview_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`interviewer_json` text DEFAULT '[]' NOT NULL,
	`objective` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`scheduled_at` integer,
	`completed_at` integer,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `interview_processes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interview_rounds_process_idx` ON `interview_rounds` (`process_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `interview_rounds_owner_idx` ON `interview_rounds` (`user_id`,`updated_at`);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `interview_round_id` text REFERENCES `interview_rounds`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE TABLE `round_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `interview_rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `round_concerns_round_idx` ON `round_concerns` (`round_id`,`status`);
--> statement-breakpoint
CREATE INDEX `round_concerns_owner_idx` ON `round_concerns` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `experience_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`round_id` text,
	`experience_id` text NOT NULL,
	`claim_id` text,
	`question_fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `interview_rounds`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`experience_id`) REFERENCES `professional_experiences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claim_id`) REFERENCES `professional_claims`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `experience_uses_session_idx` ON `experience_uses` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `experience_uses_round_idx` ON `experience_uses` (`round_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `experience_uses_owner_idx` ON `experience_uses` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `session_brains` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_version` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_brains_owner_idx` ON `session_brains` (`user_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `session_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`owner` text,
	`due_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_captures_timeline_idx` ON `session_captures` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `user_feature_flags` (
	`user_id` text NOT NULL,
	`flag` text NOT NULL,
	`enabled` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_feature_flags_unique_idx` ON `user_feature_flags` (`user_id`,`flag`);
--> statement-breakpoint
CREATE INDEX `user_feature_flags_owner_idx` ON `user_feature_flags` (`user_id`,`updated_at`);
--> statement-breakpoint
INSERT INTO `professional_experiences` (`id`,`user_id`,`source_document_id`,`title`,`summary`,`verification_status`,`confidence`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(16))), `user_id`, `id`, 'Imported resume: ' || `file_name`, substr(coalesce(`extracted_text`, ''), 1, 1000), CASE WHEN `parse_status` = 'verified' THEN 'verified' ELSE 'proposed' END, CASE WHEN `parse_status` = 'verified' THEN 1.0 ELSE 0.6 END, `created_at`, `updated_at`
FROM `documents`
WHERE `kind` = 'resume' AND json_valid(`verified_facts_json`) AND json_array_length(`verified_facts_json`) > 0;
--> statement-breakpoint
INSERT OR IGNORE INTO `professional_claims` (`id`,`experience_id`,`user_id`,`claim_text`,`claim_type`,`knowledge_class`,`source_type`,`source_id`,`source_excerpt`,`verification_status`,`verified_at`,`confidence`,`allowed_as_personal_experience`,`sensitive`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(16))), e.`id`, d.`user_id`, CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.claim') ELSE CAST(j.value AS text) END, 'other', 'VERIFIED_PERSONAL_FACT', 'resume', d.`id`, CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.evidence') ELSE CAST(j.value AS text) END, CASE WHEN d.`parse_status` = 'verified' THEN 'verified' ELSE 'proposed' END, CASE WHEN d.`parse_status` = 'verified' THEN d.`updated_at` ELSE NULL END, CASE WHEN d.`parse_status` = 'verified' THEN 1.0 ELSE 0.6 END, CASE WHEN d.`parse_status` = 'verified' THEN true ELSE false END, false, d.`created_at`, d.`updated_at`
FROM `documents` d
JOIN `professional_experiences` e ON e.`source_document_id` = d.`id`
JOIN json_each(d.`verified_facts_json`) j
WHERE d.`kind` = 'resume' AND trim(CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.claim') ELSE CAST(j.value AS text) END) <> '';
--> statement-breakpoint
INSERT INTO `claim_evidence` (`id`,`claim_id`,`user_id`,`source_type`,`source_id`,`excerpt`,`confidence`,`created_at`)
SELECT lower(hex(randomblob(16))), c.`id`, c.`user_id`, c.`source_type`, c.`source_id`, c.`source_excerpt`, c.`confidence`, c.`created_at`
FROM `professional_claims` c
WHERE c.`source_excerpt` IS NOT NULL;
--> statement-breakpoint
PRAGMA optimize;
