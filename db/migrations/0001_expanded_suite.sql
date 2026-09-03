CREATE TABLE `career_artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `bullets_json` text DEFAULT '[]' NOT NULL,
  `keywords_json` text DEFAULT '[]' NOT NULL,
  `score` real,
  `caution` text,
  `context_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `career_artifacts_owner_idx` ON `career_artifacts` (`user_id`,`created_at`);

CREATE TABLE `job_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `company` text NOT NULL,
  `job_url` text,
  `job_description` text,
  `status` text DEFAULT 'saved' NOT NULL,
  `match_score` integer,
  `notes` text,
  `next_action` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
CREATE INDEX `job_applications_owner_idx` ON `job_applications` (`user_id`,`updated_at`);
CREATE INDEX `job_applications_status_idx` ON `job_applications` (`user_id`,`status`);

ALTER TABLE `reports` ADD `notes_json` text DEFAULT '[]' NOT NULL;
ALTER TABLE `reports` ADD `action_items_json` text DEFAULT '[]' NOT NULL;
ALTER TABLE `reports` ADD `follow_up_email` text;
