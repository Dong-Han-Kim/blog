import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  date: timestamp('date').notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().notNull(),
  description: text('description'),
  thumbnail: text('thumbnail'),
  draft: boolean('draft').default(false).notNull(),
  keywords: text('keywords').array().notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
