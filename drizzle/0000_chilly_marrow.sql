CREATE TABLE `leases` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`rent_amount` real NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`payment_day` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`deposit_amount` real,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_leases_property_id` ON `leases` (`property_id`);--> statement-breakpoint
CREATE INDEX `idx_leases_tenant_id` ON `leases` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`period` text NOT NULL,
	`amount` real NOT NULL,
	`paid_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`method` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payments_lease_id` ON `payments` (`lease_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_lease_period` ON `payments` (`lease_id`,`period`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`status` text DEFAULT 'free' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
