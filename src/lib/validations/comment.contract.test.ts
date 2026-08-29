import { describe, expect, it } from 'vitest';

import {
  COMMENT_LIMITS,
  commentFormSchema,
  deleteCommentSchema,
  updateCommentSchema,
} from './comment';

/**
 * QA 계약 테스트 — 댓글 입력 규칙 정본 (B-4 / M1).
 * 세 스키마가 같은 필드 스키마 인스턴스를 공유하게 된 것이 이번 리팩터링이므로,
 * ① 공유가 실제로 되고 있는지(메시지 바이트 동일) ② 공유가 서로를 오염시키지 않는지
 * ③ issues[0] 노출 정책을 결정하는 필드 순서가 유지되는지를 고정한다.
 */

const UUID = '3f0d5a1e-9c2b-4d6f-8a11-2b7c4e5d6f70';
const base = { authorName: '홍길동', password: 'pw1234', content: '안녕하세요' };
const firstMessage = (r: { error?: { issues: { message: string }[] } }) =>
  r.error?.issues[0]?.message;
const paths = (r: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.'));

describe('COMMENT_LIMITS — 상수 정본', () => {
  it('값과 키 집합이 고정된다', () => {
    expect(Object.keys(COMMENT_LIMITS).sort()).toEqual([
      'CONTENT_MAX',
      'CONTENT_MIN',
      'CONTENT_WARN',
      'NAME_MAX',
      'NAME_MIN',
      'PASSWORD_MIN',
    ]);
    expect(COMMENT_LIMITS.CONTENT_MIN).toBe(1);
    expect(COMMENT_LIMITS.CONTENT_MAX).toBe(1000);
    expect(COMMENT_LIMITS.CONTENT_WARN).toBe(800);
    expect(COMMENT_LIMITS.PASSWORD_MIN).toBe(4);
    expect(COMMENT_LIMITS.NAME_MIN).toBe(2);
    expect(COMMENT_LIMITS.NAME_MAX).toBe(20);
  });

  it('WARN은 표현 전용이라 검증 규칙이 아니다 — 800자 초과도 통과한다', () => {
    const r = commentFormSchema.safeParse({ ...base, content: 'a'.repeat(999) });
    expect(r.success).toBe(true);
  });

  it('WARN < MAX 라는 관계가 유지된다 (카운터가 경고 없이 상한에 닿지 않도록)', () => {
    expect(COMMENT_LIMITS.CONTENT_WARN).toBeLessThan(COMMENT_LIMITS.CONTENT_MAX);
    expect(COMMENT_LIMITS.NAME_MIN).toBeLessThan(COMMENT_LIMITS.NAME_MAX);
  });
});

describe('필드 스키마 공유 — 세 스키마가 같은 규칙·같은 메시지를 낸다 (B-4.I1)', () => {
  it('content 규칙과 메시지가 commentFormSchema/updateCommentSchema에서 동일하다', () => {
    const tooLong = 'a'.repeat(1001);
    expect(firstMessage(commentFormSchema.safeParse({ ...base, content: tooLong }))).toBe(
      '댓글은 1000자 이하여야 합니다.',
    );
    expect(
      firstMessage(
        updateCommentSchema.safeParse({ commentId: UUID, password: 'pw1234', content: tooLong }),
      ),
    ).toBe('댓글은 1000자 이하여야 합니다.');
  });

  it('password 규칙과 메시지가 세 스키마에서 동일하다', () => {
    const msg = '비밀번호는 4자 이상이어야 합니다.';
    expect(firstMessage(commentFormSchema.safeParse({ ...base, password: 'abc' }))).toBe(msg);
    expect(
      firstMessage(deleteCommentSchema.safeParse({ commentId: UUID, password: 'abc' })),
    ).toBe(msg);
    expect(
      firstMessage(
        updateCommentSchema.safeParse({ commentId: UUID, password: 'abc', content: 'x' }),
      ),
    ).toBe(msg);
  });

  it('commentId 규칙과 메시지가 delete/update에서 동일하다', () => {
    const msg = '유효한 UUID 형식이어야 합니다.';
    expect(
      firstMessage(deleteCommentSchema.safeParse({ commentId: 'nope', password: 'pw1234' })),
    ).toBe(msg);
    expect(
      firstMessage(
        updateCommentSchema.safeParse({ commentId: 'nope', password: 'pw1234', content: 'x' }),
      ),
    ).toBe(msg);
  });

  // ★ 공유 인스턴스가 서로 오염되지 않는지 — 한 스키마의 파싱이 다른 스키마 결과를 바꾸면 안 된다
  it('한 스키마를 반복 파싱해도 다른 스키마의 결과가 변하지 않는다 (인스턴스 공유 안전성)', () => {
    for (let i = 0; i < 50; i += 1) {
      commentFormSchema.safeParse({ ...base, password: 'x' });
      deleteCommentSchema.safeParse({ commentId: 'bad', password: 'y' });
    }
    expect(
      updateCommentSchema.safeParse({ commentId: UUID, password: 'pw1234', content: 'ok' })
        .success,
    ).toBe(true);
    expect(commentFormSchema.safeParse(base).success).toBe(true);
  });
});

describe('경계값 — 정확히 상·하한에서 갈린다', () => {
  it.each([
    [0, false],
    [1, true],
    [999, true],
    [1000, true],
    [1001, false],
  ])('content 길이 %i → %s', (len, ok) => {
    expect(commentFormSchema.safeParse({ ...base, content: 'a'.repeat(len) }).success).toBe(ok);
  });

  it.each([
    [1, false],
    [2, true],
    [19, true],
    [20, true],
    [21, false],
  ])('authorName 길이 %i → %s', (len, ok) => {
    expect(commentFormSchema.safeParse({ ...base, authorName: 'a'.repeat(len) }).success).toBe(
      ok,
    );
  });

  it.each([
    [3, false],
    [4, true],
    [200, true],
  ])('password 길이 %i → %s', (len, ok) => {
    expect(commentFormSchema.safeParse({ ...base, password: 'a'.repeat(len) }).success).toBe(ok);
  });

  it('password에는 상한이 없다 (bcrypt 72바이트 절단은 스키마 계약이 아니다)', () => {
    expect(commentFormSchema.safeParse({ ...base, password: 'a'.repeat(5000) }).success).toBe(
      true,
    );
  });

  // ⚠️ 길이는 UTF-16 코드 유닛 기준이다 — 이모지 1자가 2를 먹는다.
  //    "1000자"라는 사용자 표기와 실제 상한이 갈리는 지점이므로 계약으로 남긴다.
  it('길이 계산은 UTF-16 코드 유닛 기준 — 이모지는 2로 센다', () => {
    const emoji = '\u{1F600}'; // 길이 2
    expect(emoji.length).toBe(2);
    expect(
      commentFormSchema.safeParse({ ...base, content: emoji.repeat(500) }).success,
    ).toBe(true); // 정확히 1000
    expect(
      commentFormSchema.safeParse({ ...base, content: emoji.repeat(500) + 'a' }).success,
    ).toBe(false); // 1001
    // 닉네임도 동일 — 이모지 10개면 20자로 상한에 닿는다
    expect(commentFormSchema.safeParse({ ...base, authorName: emoji.repeat(10) }).success).toBe(
      true,
    );
    expect(commentFormSchema.safeParse({ ...base, authorName: emoji.repeat(11) }).success).toBe(
      false,
    );
  });

  // ⚠️ trim하지 않는다 — 공백만 있는 본문·닉네임이 통과한다 (현행 계약, 변경 시 의도적 결정 필요)
  it('공백만 있는 값도 통과한다 (trim 없음)', () => {
    expect(commentFormSchema.safeParse({ ...base, content: '   ' }).success).toBe(true);
    expect(commentFormSchema.safeParse({ ...base, authorName: '  ' }).success).toBe(true);
    expect(commentFormSchema.safeParse({ ...base, password: '    ' }).success).toBe(true);
  });

  it('개행·제어문자를 거르지 않는다', () => {
    expect(commentFormSchema.safeParse({ ...base, content: '\n\n\n' }).success).toBe(true);
  });
});

describe('parentId — optional UUID 계약', () => {
  it('생략 가능하다', () => {
    expect(commentFormSchema.safeParse(base).success).toBe(true);
  });

  it('유효한 UUID를 허용한다', () => {
    expect(commentFormSchema.safeParse({ ...base, parentId: UUID }).success).toBe(true);
  });

  it('UUID가 아니면 거부하고 메시지가 고정된다', () => {
    const r = commentFormSchema.safeParse({ ...base, parentId: 'not-uuid' });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe('유효한 UUID 형식이어야 합니다.');
  });

  it('빈 문자열 parentId는 거부한다 (undefined와 동일 취급하지 않는다)', () => {
    expect(commentFormSchema.safeParse({ ...base, parentId: '' }).success).toBe(false);
  });

  it('null parentId는 거부한다 — 호출부는 undefined를 넘겨야 한다', () => {
    expect(commentFormSchema.safeParse({ ...base, parentId: null }).success).toBe(false);
  });
});

describe('필드 정의 순서 — issues[0] 노출 정책 (B-4.I3)', () => {
  it('commentFormSchema 이슈 순서는 authorName → password → content → parentId', () => {
    const r = commentFormSchema.safeParse({
      authorName: 'a',
      password: 'a',
      content: '',
      parentId: 'bad',
    });
    expect(paths(r)).toEqual(['authorName', 'password', 'content', 'parentId']);
    expect(firstMessage(r)).toBe('닉네임은 2자 이상이어야 합니다.');
  });

  it('updateCommentSchema 이슈 순서는 commentId → password → content', () => {
    const r = updateCommentSchema.safeParse({ commentId: 'bad', password: 'a', content: '' });
    expect(paths(r)).toEqual(['commentId', 'password', 'content']);
    expect(firstMessage(r)).toBe('유효한 UUID 형식이어야 합니다.');
  });

  it('deleteCommentSchema 이슈 순서는 commentId → password', () => {
    const r = deleteCommentSchema.safeParse({ commentId: 'bad', password: 'a' });
    expect(paths(r)).toEqual(['commentId', 'password']);
  });

  it('한 필드에 여러 위반이 있어도 min이 max보다 먼저 보고된다', () => {
    // content 미입력 + 닉네임 정상 → 첫 이슈가 content min
    const r = commentFormSchema.safeParse({ ...base, content: '' });
    expect(firstMessage(r)).toBe('댓글 내용을 입력해주세요.');
  });
});

describe('editContentSchema 파생 (CommentItem이 pick으로 재사용)', () => {
  const editContentSchema = updateCommentSchema.pick({ content: true });

  it('content 규칙과 메시지를 정본에서 그대로 물려받는다', () => {
    expect(firstMessage(editContentSchema.safeParse({ content: '' }))).toBe(
      '댓글 내용을 입력해주세요.',
    );
    expect(firstMessage(editContentSchema.safeParse({ content: 'a'.repeat(1001) }))).toBe(
      '댓글은 1000자 이하여야 합니다.',
    );
    expect(editContentSchema.safeParse({ content: 'a'.repeat(1000) }).success).toBe(true);
  });

  it('pick 결과에는 commentId·password가 없다 (편집 폼이 두 필드를 요구하지 않는다)', () => {
    const r = editContentSchema.safeParse({ content: 'ok' });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).toEqual(['content']);
  });

  it('pick이 원본 updateCommentSchema를 훼손하지 않는다', () => {
    editContentSchema.safeParse({ content: '' });
    expect(
      updateCommentSchema.safeParse({ commentId: UUID, password: 'pw1234', content: 'ok' })
        .success,
    ).toBe(true);
  });
});
