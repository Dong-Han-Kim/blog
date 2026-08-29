'use server';

import { headers } from 'next/headers';
import { eq, asc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { db } from '@/lib/db';
import { comments, commentSecrets } from '@/lib/db/schema';
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

// comment_secrets는 comments와 1:1 (FK cascade)이므로 secrets 단독 조회로
// 존재 확인과 해시 획득을 동시에 처리한다
async function verifyPassword(
  commentId: string,
  password: string,
): Promise<'ok' | 'not_found' | 'wrong_password'> {
  const [secret] = await db
    .select({ passwordHash: commentSecrets.passwordHash })
    .from(commentSecrets)
    .where(eq(commentSecrets.commentId, commentId))
    .limit(1);

  if (!secret) return 'not_found';
  const valid = await bcrypt.compare(password, secret.passwordHash);
  return valid ? 'ok' : 'wrong_password';
}

/** 실패 응답 공통 형태 — 타입 선언이라 'use server' export 제약과 무관하다 */
type ActionFailure = { success: false; error: string };

/**
 * zod 첫 이슈 메시지 → 사용자 노출 문구 (reuse-audit C-7 / H5).
 * issues[0]만 노출하는 현행 정책을 여기 한 곳에 고정한다.
 * 구조적 타입을 쓰는 이유: ZodError<T>의 제네릭 변성 문제를 피하고 import를 줄인다.
 */
function firstIssueMessage(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? '입력값을 확인해주세요.';
}

/** verifyPassword 결과를 실패 응답으로 매핑. 'ok'면 null(계속 진행) */
function mapVerifyResult(
  result: 'ok' | 'not_found' | 'wrong_password',
): ActionFailure | null {
  if (result === 'not_found') {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }
  if (result === 'wrong_password') {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }
  return null;
}

/** 금지어 포함 시 실패 응답, 아니면 null */
function bannedWordError(content: string): ActionFailure | null {
  if (containsBannedWord(content)) {
    return { success: false, error: '부적절한 표현이 포함되어 있어요. 내용을 수정해주세요.' };
  }
  return null;
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
    .select(commentColumns)
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
    return { success: false, error: firstIssueMessage(parsed.error) };
  }

  // 4. 금지어 체크
  const banned = bannedWordError(parsed.data.content);
  if (banned) return banned;

  // 5. 비밀번호 해싱 + DB 저장
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    // 댓글 본문과 해시를 원자적으로 저장 — 해시는 Realtime 브로드캐스트 대상이
    // 아닌 comment_secrets에만 기록한다
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(comments)
        .values({
          postSlug: formData.postSlug,
          authorName: parsed.data.authorName,
          content: parsed.data.content,
          parentId: parsed.data.parentId ?? null,
        })
        .returning(commentColumns);

      await tx.insert(commentSecrets).values({
        commentId: row.id,
        passwordHash,
      });

      return row;
    });

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
    return { success: false, error: firstIssueMessage(parsed.error) };
  }

  // 2. 금지어 체크
  const banned = bannedWordError(parsed.data.content);
  if (banned) return banned;

  // 3. 비밀번호 검증 (secrets 단독 조회)
  const failure = mapVerifyResult(
    await verifyPassword(parsed.data.commentId, parsed.data.password),
  );
  if (failure) return failure;

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
    return { success: false, error: firstIssueMessage(parsed.error) };
  }

  // 2. 비밀번호 검증 (secrets 단독 조회)
  const failure = mapVerifyResult(
    await verifyPassword(parsed.data.commentId, parsed.data.password),
  );
  if (failure) return failure;

  // 3. 삭제 (CASCADE로 대댓글·comment_secrets도 함께 삭제됨)
  await db.delete(comments).where(eq(comments.id, parsed.data.commentId));

  return { success: true };
}

export async function verifyCommentPassword(formData: {
  commentId: string;
  password: string;
}): Promise<ActionResult> {
  const failure = mapVerifyResult(
    await verifyPassword(formData.commentId, formData.password),
  );
  if (failure) return failure;

  return { success: true };
}
