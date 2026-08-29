import { describe, expect, it } from 'vitest';
import { COMMENT_LIMITS, commentFormSchema, updateCommentSchema } from './comment';

const base = { authorName: '홍길동', password: 'pw1234', content: '안녕하세요' };
const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('COMMENT_LIMITS', () => {
  it('규칙 값이 고정된다', () => {
    expect(COMMENT_LIMITS).toEqual({
      CONTENT_MIN: 1, CONTENT_MAX: 1000, CONTENT_WARN: 800,
      PASSWORD_MIN: 4, NAME_MIN: 2, NAME_MAX: 20,
    });
  });
});

describe('commentFormSchema — content 경계값', () => {
  it.each([
    [0, false, '댓글 내용을 입력해주세요.'],
    [1, true, undefined],
    [1000, true, undefined],
    [1001, false, '댓글은 1000자 이하여야 합니다.'],
  ])('길이 %i → success=%s', (len, ok, message) => {
    const r = commentFormSchema.safeParse({ ...base, content: 'a'.repeat(len) });
    expect(r.success).toBe(ok);
    if (!ok) expect(firstMessage(r)).toBe(message);
  });
});

describe('commentFormSchema — password 경계값', () => {
  it('3자는 실패하고 메시지가 고정된다', () => {
    const r = commentFormSchema.safeParse({ ...base, password: 'abc' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe('비밀번호는 4자 이상이어야 합니다.');
  });
  it('4자는 통과한다', () => {
    expect(commentFormSchema.safeParse({ ...base, password: 'abcd' }).success).toBe(true);
  });
});

describe('commentFormSchema — authorName 경계값', () => {
  it.each([
    [1, false, '닉네임은 2자 이상이어야 합니다.'],
    [2, true, undefined],
    [20, true, undefined],
    [21, false, '닉네임은 20자 이하여야 합니다.'],
  ])('길이 %i → success=%s', (len, ok, message) => {
    const r = commentFormSchema.safeParse({ ...base, authorName: 'a'.repeat(len) });
    expect(r.success).toBe(ok);
    if (!ok) expect(firstMessage(r)).toBe(message);
  });
});

describe('필드 정의 순서 (issues[0] 노출 정책 고정)', () => {
  it('authorName·password·content 동시 위반 시 authorName 메시지가 첫 이슈다', () => {
    const r = commentFormSchema.safeParse({ authorName: 'a', password: 'a', content: '' });
    expect(firstMessage(r)).toBe('닉네임은 2자 이상이어야 합니다.');
  });
  it('updateCommentSchema는 commentId·password·content 순이다', () => {
    const r = updateCommentSchema.safeParse({ commentId: 'not-uuid', password: 'a', content: '' });
    expect(firstMessage(r)).toBe('유효한 UUID 형식이어야 합니다.');
  });
});

describe('editContentSchema 파생 (CommentItem)', () => {
  const editContentSchema = updateCommentSchema.pick({ content: true });
  it('본문 규칙과 메시지를 정본에서 그대로 물려받는다', () => {
    expect(firstMessage(editContentSchema.safeParse({ content: '' }))).toBe('댓글 내용을 입력해주세요.');
    expect(firstMessage(editContentSchema.safeParse({ content: 'a'.repeat(1001) })))
      .toBe('댓글은 1000자 이하여야 합니다.');
  });
});
