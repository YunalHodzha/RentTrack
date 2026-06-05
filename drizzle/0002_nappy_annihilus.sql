DROP INDEX `unique_lease_period`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_lease_period` ON `payments` (`lease_id`,`period`) WHERE "payments"."deleted_at" is null;