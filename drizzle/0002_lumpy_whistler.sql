-- 멱등 가드: 운영 DB가 부분 적용/push 동기화된 상태여도 재실행 가능하도록 작성.
-- M-2 수정 — password_hash를 Realtime publication 대상인 comments에서
-- 비공개 테이블 comment_secrets로 분리하고 데이터를 이동한다.
CREATE TABLE IF NOT EXISTS "comment_secrets" (
	"comment_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "comment_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'comment_secrets_comment_id_comments_id_fk'
      AND conrelid = '"comment_secrets"'::regclass
  ) THEN
    ALTER TABLE "comment_secrets" ADD CONSTRAINT "comment_secrets_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
-- 데이터 이동 + 컬럼 제거: comments.password_hash가 아직 존재할 때만 수행.
-- ON CONFLICT DO NOTHING — 재실행/부분 적용 상태에서도 안전.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comments'
      AND column_name = 'password_hash'
  ) THEN
    INSERT INTO "comment_secrets" ("comment_id", "password_hash")
    SELECT "id", "password_hash" FROM "comments"
    ON CONFLICT ("comment_id") DO NOTHING;
    ALTER TABLE "comments" DROP COLUMN "password_hash";
  END IF;
END $$;
