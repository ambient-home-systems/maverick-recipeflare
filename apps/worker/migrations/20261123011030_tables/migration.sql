CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`recipe_id` text,
	`import_job_id` text,
	`role` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`has_variants` integer DEFAULT false NOT NULL,
	`original_filename` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_assets_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_assets_import_job_id_import_jobs_id_fk` FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_assets_created_by_members_id_fk` FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`name_key` text NOT NULL UNIQUE,
	`plural_name` text,
	`description` text DEFAULT '' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`label_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_foods_label_id_labels_id_fk` FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY,
	`singleton` integer DEFAULT 1 NOT NULL UNIQUE,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "household_singleton" CHECK("singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`source_url` text,
	`input` text NOT NULL,
	`result` text,
	`error_code` text,
	`error_message` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`recipe_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`finished_at` text,
	CONSTRAINT `fk_import_jobs_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_import_jobs_created_by_members_id_fk` FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`name_key` text NOT NULL UNIQUE,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY,
	`email` text UNIQUE,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`disabled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizers` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "organizers_kind" CHECK("kind" IN ('category', 'tag', 'tool'))
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`section` text,
	`original_text` text,
	`quantity` real,
	`unit_id` text,
	`food_id` text,
	`note` text DEFAULT '' NOT NULL,
	CONSTRAINT `fk_recipe_ingredients_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_recipe_ingredients_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_recipe_ingredients_food_id_foods_id_fk` FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "recipe_ingredients_not_empty" CHECK("original_text" IS NOT NULL OR "food_id" IS NOT NULL OR "note" <> '')
);
--> statement-breakpoint
CREATE TABLE `recipe_notes` (
	`id` text PRIMARY KEY,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT `fk_recipe_notes_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recipe_organizers` (
	`recipe_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	CONSTRAINT `recipe_organizers_pk` PRIMARY KEY(`recipe_id`, `organizer_id`),
	CONSTRAINT `fk_recipe_organizers_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_recipe_organizers_organizer_id_organizers_id_fk` FOREIGN KEY (`organizer_id`) REFERENCES `organizers`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recipe_search` (
	`doc_id` integer PRIMARY KEY,
	`recipe_id` text NOT NULL UNIQUE,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`ingredients` text DEFAULT '' NOT NULL,
	`organizers` text DEFAULT '' NOT NULL,
	CONSTRAINT `fk_recipe_search_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` text PRIMARY KEY,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`section` text,
	`text` text NOT NULL,
	`duration_seconds` integer,
	`ingredient_refs` text DEFAULT '[]' NOT NULL,
	CONSTRAINT `fk_recipe_steps_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`servings` real,
	`yield_quantity` real,
	`yield_unit` text,
	`prep_time_seconds` integer,
	`cook_time_seconds` integer,
	`total_time_seconds` integer,
	`nutrition` text,
	`source_name` text,
	`source_url` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_recipes_created_by_members_id_fk` FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_recipes_updated_by_members_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `members`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`name_key` text NOT NULL UNIQUE,
	`plural_name` text,
	`abbreviation` text,
	`plural_abbreviation` text,
	`use_abbreviation` integer DEFAULT false NOT NULL,
	`fraction` integer DEFAULT true NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`standard_quantity` real,
	`standard_unit` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_recipe_idx` ON `assets` (`recipe_id`,`role`,`position`);--> statement-breakpoint
CREATE INDEX `assets_import_job_idx` ON `assets` (`import_job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_one_cover_idx` ON `assets` (`recipe_id`) WHERE role = 'cover';--> statement-breakpoint
CREATE INDEX `foods_label_id_idx` ON `foods` (`label_id`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_created_at_idx` ON `import_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_source_url_idx` ON `import_jobs` (`source_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `organizers_kind_slug_idx` ON `organizers` (`kind`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_ingredients_position_idx` ON `recipe_ingredients` (`recipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_food_id_idx` ON `recipe_ingredients` (`food_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_unit_id_idx` ON `recipe_ingredients` (`unit_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_notes_position_idx` ON `recipe_notes` (`recipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `recipe_organizers_organizer_idx` ON `recipe_organizers` (`organizer_id`,`recipe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_steps_position_idx` ON `recipe_steps` (`recipe_id`,`position`);--> statement-breakpoint
CREATE INDEX `recipes_updated_at_idx` ON `recipes` (`updated_at`);--> statement-breakpoint
CREATE INDEX `recipes_created_at_idx` ON `recipes` (`created_at`);--> statement-breakpoint
CREATE INDEX `recipes_title_idx` ON `recipes` ("title" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `recipes_source_url_idx` ON `recipes` (`source_url`);