-- 멱등 가드: 이미 지워진 DB에서도 재실행 가능하도록 IF EXISTS를 쓴다.
--
-- comments에 `USING (true)` / `WITH CHECK (true)`짜리 전면 허용 정책 세 개가
-- 있었다(댓글 작성·수정·삭제, 대상 역할 public = 모든 역할). 0003이 RLS를 켜면서
-- 이 정책들이 활성화되어, 브라우저에 노출된 anon key만으로 **아무 댓글이나 조건 없이
-- 삽입·수정·삭제**할 수 있는 상태가 됐다. 앱은 수정·삭제 때 비밀번호 해시를 대조하지만
-- 그 검사는 서버 액션에만 있고 DB 제약이 아니므로, 이 경로로는 우회된다.
--
-- 지워도 앱은 영향받지 않는다. 저장소 전체에서 Supabase 클라이언트는 실시간 구독
-- (useCommentRealtime의 channel/on)에만 쓰이고, 쓰기는 전부 db/index.ts(DATABASE_URL,
-- 테이블 소유자 role 직결)를 지나며 소유자 연결은 RLS를 적용받지 않는다.
--
-- 읽기 정책은 남긴다. 하나라도 없으면 Realtime이 구독자(anon) 역할로 RLS를 재평가할 때
-- 이벤트가 전부 막혀 실시간 반영이 조용히 멈춘다(0003 주석 참고).
DROP POLICY IF EXISTS "댓글 작성" ON "comments";--> statement-breakpoint
DROP POLICY IF EXISTS "댓글 수정" ON "comments";--> statement-breakpoint
DROP POLICY IF EXISTS "댓글 삭제" ON "comments";
