import { z } from 'zod';

/**
 * 댓글 입력 규칙 정본 (reuse-audit B-4 / M1). 서버 규칙 우선(설계 D11).
 * 값 변경 금지 — 폼·다이얼로그·서버 액션이 전부 여기를 신뢰한다.
 */
export const COMMENT_LIMITS = {
  CONTENT_MIN: 1,
  CONTENT_MAX: 1000,
  /** 글자 수 카운터가 accent로 전환되는 지점 (표현 전용, 검증 규칙 아님) */
  CONTENT_WARN: 800,
  PASSWORD_MIN: 4,
  NAME_MIN: 2,
  NAME_MAX: 20,
} as const;

// 재사용 필드 스키마 — zod 스키마는 불변 객체라 여러 object 스키마가 공유해도 안전하다.
// 에러 메시지에 삽입되는 숫자는 COMMENT_LIMITS에서 오지만 결과 문자열은 기존과 바이트 동일하다.
const nameField = z
  .string()
  .min(COMMENT_LIMITS.NAME_MIN, `닉네임은 ${COMMENT_LIMITS.NAME_MIN}자 이상이어야 합니다.`)
  .max(COMMENT_LIMITS.NAME_MAX, `닉네임은 ${COMMENT_LIMITS.NAME_MAX}자 이하여야 합니다.`);

const passwordField = z
  .string()
  .min(COMMENT_LIMITS.PASSWORD_MIN, `비밀번호는 ${COMMENT_LIMITS.PASSWORD_MIN}자 이상이어야 합니다.`);

const contentField = z
  .string()
  .min(COMMENT_LIMITS.CONTENT_MIN, '댓글 내용을 입력해주세요.')
  .max(COMMENT_LIMITS.CONTENT_MAX, `댓글은 ${COMMENT_LIMITS.CONTENT_MAX}자 이하여야 합니다.`);

const commentIdField = z.string().uuid({ error: '유효한 UUID 형식이어야 합니다.' });

// ⚠️ 필드 정의 순서 불변 — actions/comment.ts가 issues[0]만 사용자에게 노출하므로
// 순서를 바꾸면 동시 위반 시 표시되는 메시지가 바뀐다 (B-4.I3)
export const commentFormSchema = z.object({
  authorName: nameField,
  password: passwordField,
  content: contentField,
  parentId: commentIdField.optional(),
});

export type CommentFormData = z.infer<typeof commentFormSchema>;

export const deleteCommentSchema = z.object({
  commentId: commentIdField,
  password: passwordField,
});

export type DeleteCommentData = z.infer<typeof deleteCommentSchema>;

export const updateCommentSchema = z.object({
  commentId: commentIdField,
  password: passwordField,
  content: contentField,
});

export type UpdateCommentData = z.infer<typeof updateCommentSchema>;
