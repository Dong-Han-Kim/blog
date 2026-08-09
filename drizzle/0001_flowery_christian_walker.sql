-- 멱등 가드: 운영 DB가 drizzle-kit push로 스키마 선반영된 상태(컬럼/FK 이미 존재)에서도
-- 오류 없이 재실행 가능하도록 작성한 마이그레이션
-- 수동 추가: 부모가 이미 삭제된 고아 대댓글의 parent_id를 NULL로 정리
-- (기존 데이터에 고아 레코드가 있으면 아래 FK 추가가 실패하므로 반드시 선행)
UPDATE "comments" c SET "parent_id" = NULL
WHERE c."parent_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "comments" p WHERE p."id" = c."parent_id");--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comments_parent_id_comments_id_fk'
      AND conrelid = '"comments"'::regclass
  ) THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
