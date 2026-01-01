import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().notNull(),
  description: text('description'),
  thumbnail: text('thumbnail'),
  draft: boolean('draft').default(false).notNull(),
  keywords: text('keywords').array().notNull(),
  content: text('content').notNull(),
});

export const comments = pgTable('comments', {
  id: ,
  username: text('username').notNull(),
  password: text('password').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});