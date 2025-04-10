DROP TABLE "folder";--> statement-breakpoint
ALTER TABLE "user_file" DROP CONSTRAINT "user_file_folder_id_folder_id_fk";
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_file" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_file" DROP COLUMN IF EXISTS "uri";--> statement-breakpoint
ALTER TABLE "user_file" DROP COLUMN IF EXISTS "folder_id";--> statement-breakpoint
ALTER TABLE "user_file" DROP COLUMN IF EXISTS "is_folder";