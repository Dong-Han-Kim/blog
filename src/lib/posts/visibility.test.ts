import { describe, expect, it } from 'vitest';

import { isPostViewable } from './visibility';

describe('isPostViewable — 초안 노출 정책 (nodeEnv 명시)', () => {
  it('발행 글은 프로덕션에서도 보인다', () => {
    expect(isPostViewable({ draft: false }, 'production')).toBe(true);
  });

  it('발행 글은 개발 환경에서도 보인다', () => {
    expect(isPostViewable({ draft: false }, 'development')).toBe(true);
  });

  it('draft 필드가 없는 글은 발행으로 본다 (스키마 기본값 false와 동일)', () => {
    expect(isPostViewable({}, 'production')).toBe(true);
  });

  it('초안은 프로덕션에서 감춘다', () => {
    expect(isPostViewable({ draft: true }, 'production')).toBe(false);
  });

  it('초안은 개발 환경에서 보인다 (로컬 미리보기 보존)', () => {
    expect(isPostViewable({ draft: true }, 'development')).toBe(true);
  });

  it('production 외의 값은 모두 미리보기 허용이다 (test / undefined)', () => {
    expect(isPostViewable({ draft: true }, 'test')).toBe(true);
    expect(isPostViewable({ draft: true }, undefined)).toBe(true);
  });

  it('nodeEnv를 생략하면 process.env.NODE_ENV를 본다 (라우트 호출 형태)', () => {
    // 유닛 테스트 실행 환경은 NODE_ENV='test' — 프로덕션이 아니므로 허용된다
    expect(process.env.NODE_ENV).not.toBe('production');
    expect(isPostViewable({ draft: true })).toBe(true);
  });
});
