CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"date" timestamp NOT NULL,
	"category" text NOT NULL,
	"tags" text[] NOT NULL,
	"description" text,
	"thumbnail" text,
	"draft" boolean DEFAULT false NOT NULL,
	"keywords" text[] NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "comments" RENAME COLUMN "username" TO "post_id";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "author_name" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;