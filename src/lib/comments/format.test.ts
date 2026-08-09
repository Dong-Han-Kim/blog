import { describe, expect, it } from 'vitest';

import { formatCommentTime } from './format';

describe('formatCommentTime', () => {
  it('데스크톱: UTC ISO를 KST(UTC+9) YYYY-MM-DD HH:mm으로 포맷한다', () => {
    expect(formatCommentTime('2026-08-09T03:05:00.000Z')).toBe('2026-08-09 12:05');
  });

  it('모바일: MM-DD HH:mm 축약 포맷을 반환한다', () => {
    expect(formatCommentTime('2026-08-09T03:05:00.000Z', true)).toBe('08-09 12:05');
  });

  it('KST 변환으로 날짜/연도가 넘어가는 경계를 처리한다', () => {
    // 20:30 UTC → 다음날 05:30 KST
    expect(formatCommentTime('2026-03-15T20:30:00.000Z')).toBe('2026-03-16 05:30');
    // 12-31 16:00 UTC → 다음해 01-01 01:00 KST
    expect(formatCommentTime('2025-12-31T16:00:00.000Z')).toBe('2026-01-01 01:00');
  });

  it('오프셋이 붙은 ISO도 절대 시각 기준으로 동일하게 포맷한다', () => {
    expect(formatCommentTime('2026-08-09T12:05:00+09:00')).toBe('2026-08-09 12:05');
  });

  it('한 자리 월/일/시/분을 0으로 패딩한다', () => {
    expect(formatCommentTime('2026-01-02T00:04:00.000Z')).toBe('2026-01-02 09:04');
  });

  it('파싱 불가능한 입력은 원문을 그대로 반환한다', () => {
    expect(formatCommentTime('not-a-date')).toBe('not-a-date');
    expect(formatCommentTime('')).toBe('');
  });
});
