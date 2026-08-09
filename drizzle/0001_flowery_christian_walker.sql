-- 수동 추가: 부모가 이미 삭제된 고아 대댓글의 parent_id를 NULL로 정리
-- (기존 데이터에 고아 레코드가 있으면 아래 FK 추가가 실패하므로 반드시 선행)
UPDATE "comments" c SET "parent_id" = NULL
WHERE c."parent_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "comments" p WHERE p."id" = c."parent_id");--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;