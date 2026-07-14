ALTER TABLE "notes" ALTER COLUMN "topic_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "published_at" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN IF NOT EXISTS "cover_click_rate" double precision;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "external_note_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "registered_by" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "sync_status" varchar(20) DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "sync_error" text;
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp;
--> statement-breakpoint
UPDATE "notes" n
SET "registered_by" = t."creator_id"
FROM "topics" t
WHERE n."topic_id" = t."id" AND n."registered_by" IS NULL;
--> statement-breakpoint
UPDATE "notes"
SET "external_note_id" = substring("xhs_note_url" from '[0-9A-Fa-f]{24}')
WHERE "external_note_id" IS NULL;
--> statement-breakpoint
UPDATE "users" SET "role" = 'teacher', "updated_at" = now() WHERE "role" = 'editor';
