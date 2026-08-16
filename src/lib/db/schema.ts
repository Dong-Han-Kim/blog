import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

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
);

// 비밀번호 해시 전용 테이블 — Realtime publication에 절대 추가하지 않는다.
// comments가 publication 대상이라 전체 행이 브로드캐스트되므로, 비밀 데이터는
// 이 테이블로 분리한다. comments와 1:1이며 부모 삭제 시 CASCADE로 함께 삭제.
export const commentSecrets = pgTable('comment_secrets', {
  commentId: uuid('comment_id')
    .primaryKey()
    .references(() => comments.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
}).enableRLS(); // 정책 없이 RLS만 활성 → PostgREST(anon) 전면 차단. 직결(소유자) 경로는 영향 없음
