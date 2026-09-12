import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// RLS는 켜되 comment_secrets처럼 deny-all로 두지 않는다 — anon 대상 SELECT
// 허용 정책이 반드시 함께 있어야 한다(마이그레이션 SQL에 수기 추가). Supabase
// Realtime의 postgres_changes는 구독 클라이언트(항상 anon) role로 RLS를
// 재평가하므로, SELECT를 막으면 INSERT/UPDATE/DELETE 이벤트가 전부 발화하지
// 않는다(useCommentRealtime 실시간 반영 중단, DELETE도 payload.old에 같은
// SELECT 정책이 걸림). INSERT/UPDATE/DELETE 정책은 만들지 않는다 — 서버
// 액션은 db/index.ts(DATABASE_URL, 테이블 소유자 role 직결)로 RLS 자체를
// 적용받지 않으므로 영향 없이 anon을 통한 직접 쓰기만 막힌다. 근거:
// docs/codebase/comments-db.md
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postSlug: text('post_slug').notNull(),
    authorName: varchar('author_name', { length: 50 }).notNull(),
    content: text('content').notNull(),
    // self-FK — 부모 댓글 삭제 시 대댓글도 함께 삭제 (고아 레코드 방지)
    parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_comments_post_slug').on(table.postSlug),
    index('idx_comments_created_at').on(table.createdAt),
  ],
).enableRLS();

// 비밀번호 해시 전용 테이블 — Realtime publication에 절대 추가하지 않는다.
// comments가 publication 대상이라 전체 행이 브로드캐스트되므로, 비밀 데이터는
// 이 테이블로 분리한다. comments와 1:1이며 부모 삭제 시 CASCADE로 함께 삭제.
export const commentSecrets = pgTable('comment_secrets', {
  commentId: uuid('comment_id')
    .primaryKey()
    .references(() => comments.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
}).enableRLS(); // 정책 없이 RLS만 활성 → PostgREST(anon) 전면 차단. 직결(소유자) 경로는 영향 없음
