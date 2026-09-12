-- 멱등 가드: 운영 DB가 부분 적용된 상태여도 재실행 가능하도록 작성.
--
-- comments의 RLS를 켠다. comment_secrets(0002)와 달리 정책 없는 deny-all로
-- 두면 안 된다 — Supabase Realtime의 postgres_changes는 구독 클라이언트
-- (브라우저는 항상 anon key)의 role로 RLS를 재평가하므로, SELECT를 허용하는
-- 정책이 없으면 서버 액션의 INSERT/UPDATE 자체는 성공해도 모든 브라우저의
-- 실시간 반영이 조용히 멈춘다(useCommentRealtime의 INSERT/UPDATE/DELETE 이벤트가
-- 전부 발화하지 않음 — DELETE도 payload.old 기준으로 같은 SELECT 정책이 걸린다).
-- 그래서 이 마이그레이션은 SELECT 허용 정책 하나를 함께 만든다. 댓글 본문은
-- 원래 공개 데이터이므로(비밀번호 해시는 별도 테이블 comment_secrets에 있다)
-- 이 정책으로 인한 추가 노출은 없다.
--
-- INSERT/UPDATE/DELETE 정책은 의도적으로 만들지 않는다. 앱의 모든 쓰기는
-- db/index.ts(DATABASE_URL, 테이블 소유자 role 직결)를 거치고, 소유자 role
-- 연결은 RLS 자체를 적용받지 않는다(comment_secrets와 동일 근거). 즉 서버
-- 액션은 이 마이그레이션으로 영향받지 않고, anon key를 통한 직접 삽입·수정·
-- 삭제만 막힌다. 근거: docs/codebase/comments-db.md.
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'comments'
      AND policyname = 'comments_select_anon'
  ) THEN
    CREATE POLICY "comments_select_anon" ON "comments"
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
