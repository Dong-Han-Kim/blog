'use server';

import { db } from '@/db';
import { comments } from '@/db/schema';

interface CreateCommentDataProps {
  postId: number;
  authorName: string;
  passwordHash: string;
  content: string;
  parentId?: number | null;
}

export async function createComment(data: CreateCommentDataProps) {
  await db.insert(comments).values({
    postId: data.postId,
    authorName: data.authorName,
    passwordHash: data.passwordHash,
    content: data.content,
    parentId: data.parentId ?? null,
  });
}
