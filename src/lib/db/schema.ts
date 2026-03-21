import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postSlug: text('post_slug').notNull(),
    authorName: varchar('author_name', { length: 50 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    content: text('content').notNull(),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_comments_post_slug').on(table.postSlug),
    index('idx_comments_created_at').on(table.createdAt),
  ],
);
