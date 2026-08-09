'use server';

import { headers } from 'next/headers';
import { eq, asc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { db } from '@/lib/db';
import { comments } from '@/lib/db/schema';
import { commentFormSchema, deleteCommentSchema, updateCommentSchema } from '@/lib/validations/comment';
import { isHoneypotFilled } from '@/lib/spam/honeypot';
import { checkRateLimit } from '@/lib/spam/rate-limit';
import { containsBannedWord } from '@/lib/spam/banned-words';
import type { Comment } from '@/types/comment';

interface ActionResult {
  success: boolean;
  error?: string;
}

// 뮤테이션 성공 시 생성/수정된 댓글을 함께 반환 — 클라이언트가 Realtime 없이도
// 즉시 트리에 반영할 수 있게 한다 (허니팟 성공 위장 시에는 comment 없음)
interface CommentActionResult extends ActionResult {
  comment?: Comment;
}

// .returning() 공용 컬럼 셋 — passwordHash는 클라이언트로 절대 내보내지 않는다
const commentColumns = {
  id: comments.id,
  postSlug: comments.postSlug,
  authorName: comments.authorName,
  content: comments.content,
  parentId: comments.parentId,
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
};

// Postgres FK 위반(23503) 판별 — postgres-js 에러 객체의 code 프로퍼티 기준
function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23503'
  );
}

function serializeComment(row: {
  id: string;
  postSlug: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): Comment {
  return {
    ...row,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function getCommentsByPostSlug(postSlug: string): Promise<Comment[]> {
  const rows = await db
    .select({
      id: comments.id,
      postSlug: comments.postSlug,
      authorName: comments.authorName,
      content: comments.content,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
    })
    .from(comments)
    .where(eq(comments.postSlug, postSlug))
    .orderBy(asc(comments.createdAt));

  return rows.map(serializeComment);
}

export async function createComment(formData: {
  authorName: string;
  password: string;
  content: string;
  parentId?: string;
  honeypot?: string;
  postSlug: string;
}): Promise<CommentActionResult> {
  // 1. 허니팟 체크 — 봇에게는 성공한 척
  if (isHoneypotFilled(formData.honeypot)) {
    return { success: true };
  }

  // 2. Rate Limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown';
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `잠시 후에 다시 시도해주세요 (${rateCheck.retryAfterSeconds}초 후 작성 가능)`,
    };
  }

  // 3. Zod 검증
  const parsed = commentFormSchema.safeParse({
    authorName: formData.authorName,
    password: formData.password,
    content: formData.content,
    parentId: formData.parentId,
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 4. 금지어 체크
  if (containsBannedWord(parsed.data.content)) {
    return { success: false, error: '부적절한 표현이 포함되어 있어요. 내용을 수정해주세요.' };
  }

  // 5. 비밀번호 해싱 + DB 저장
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const [created] = await db
      .insert(comments)
      .values({
        postSlug: formData.postSlug,
        authorName: parsed.data.authorName,
        passwordHash,
        content: parsed.data.content,
        parentId: parsed.data.parentId ?? null,
      })
      .returning(commentColumns);

    return { success: true, comment: serializeComment(created) };
  } catch (err) {
    // 답글 작성 도중 부모 댓글이 삭제된 레이스 — FK 위반을 사용자 메시지로 매핑
    if (isForeignKeyViolation(err)) {
      return { success: false, error: '원 댓글이 삭제되어 답글을 남길 수 없어요.' };
    }
    throw err;
  }
}

export async function updateComment(formData: {
  commentId: string;
  password: string;
  content: string;
}): Promise<CommentActionResult> {
  // 1. Zod 검증
  const parsed = updateCommentSchema.safeParse(formData);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 2. 금지어 체크
  if (containsBannedWord(parsed.data.content)) {
    return { success: false, error: '부적절한 표현이 포함되어 있어요. 내용을 수정해주세요.' };
  }

  // 3. 댓글 조회 + 비밀번호 검증
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, parsed.data.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(parsed.data.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  // 4. 업데이트 — 갱신된 content/updatedAt을 반환해 클라이언트가 즉시 반영
  const [updated] = await db
    .update(comments)
    .set({
      content: parsed.data.content,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, parsed.data.commentId))
    .returning(commentColumns);

  // 비밀번호 검증과 업데이트 사이에 부모 CASCADE 삭제 등으로 대상이 사라진 레이스
  if (!updated) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  return { success: true, comment: serializeComment(updated) };
}

export async function deleteComment(formData: {
  commentId: string;
  password: string;
}): Promise<ActionResult> {
  // 1. Zod 검증
  const parsed = deleteCommentSchema.safeParse(formData);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 2. 댓글 조회 + 비밀번호 검증
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, parsed.data.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(parsed.data.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  // 3. 삭제 (CASCADE로 대댓글도 삭제됨)
  await db.delete(comments).where(eq(comments.id, parsed.data.commentId));

  return { success: true };
}

export async function verifyCommentPassword(formData: {
  commentId: string;
  password: string;
}): Promise<ActionResult> {
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, formData.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(formData.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  return { success: true };
}
