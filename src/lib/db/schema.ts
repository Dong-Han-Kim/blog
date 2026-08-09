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
    passwordHash: text('password_hash').notNull(),
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
