import { describe, expect, it } from 'vitest';

import { BANNED_PATTERNS, containsBannedWord } from './banned-words';

const SPAM_SAMPLES = [
  ['카지노', '무료 카지노 가입 이벤트'],
  ['도박', '온라인 도박 사이트 추천'],
  ['대출', '무직자 대출 상담 받으세요'],
  ['성인', '성인 전용 콘텐츠 안내'],
  ['porn', 'free porn links here'],
  ['casino', 'best casino bonus'],
  ['gambling', 'online gambling tips'],
] as const;

const CLEAN_SAMPLES = [
  '좋은 글 잘 읽었습니다.',
  'Next.js 라우팅 설명이 명확하네요.',
  '카지', // 부분 단어는 금지어가 아니다
  'This is a perfectly normal comment.',
];

/** 같은 입력을 n번 호출한 결과 배열 */
function callTimes(content: string, times: number): boolean[] {
  return Array.from({ length: times }, () => containsBannedWord(content));
}

describe('containsBannedWord', () => {
  describe('금지어 검출', () => {
    it.each(SPAM_SAMPLES)('%s 패턴을 검출한다', (_label, content) => {
      expect(containsBannedWord(content)).toBe(true);
    });

    it('대소문자를 구분하지 않는다', () => {
      expect(containsBannedWord('Casino')).toBe(true);
      expect(containsBannedWord('PORN')).toBe(true);
      expect(containsBannedWord('GaMbLiNg')).toBe(true);
    });

    it('문장 중간의 부분 문자열도 검출한다', () => {
      expect(containsBannedWord('안녕하세요 카지노 후기 남깁니다')).toBe(true);
      expect(containsBannedWord('go to thecasinosite now')).toBe(true);
    });
  });

  describe('정상 입력', () => {
    it.each(CLEAN_SAMPLES)('오검출하지 않는다: %s', (content) => {
      expect(containsBannedWord(content)).toBe(false);
    });

    it('빈 문자열은 false다', () => {
      expect(containsBannedWord('')).toBe(false);
    });
  });

  // 회귀 방지: /g 플래그 + test()의 lastIndex 누적으로 결과가 진동했던 결함.
  // 아래 세 케이스는 정규식이 모듈 레벨 싱글턴이어도 호출 간 상태가 남지 않음을 보장한다.
  describe('호출 간 상태 오염 방지', () => {
    it('같은 입력을 5번 연속 호출해도 결과가 모두 동일하다', () => {
      expect(callTimes('카지노 광고입니다', 5)).toEqual([true, true, true, true, true]);
      expect(callTimes('평범한 댓글입니다', 5)).toEqual([false, false, false, false, false]);
    });

    it('서로 다른 스팸을 연속 호출해도 전부 검출한다', () => {
      const results = SPAM_SAMPLES.map(([, content]) => containsBannedWord(content));
      expect(results).toEqual(SPAM_SAMPLES.map(() => true));
    });

    it('깨끗한 입력 뒤에 오는 스팸도 검출한다', () => {
      expect(containsBannedWord('정상 댓글입니다')).toBe(false);
      expect(containsBannedWord('카지노 홍보글')).toBe(true);
    });

    it('스팸 뒤에 오는 깨끗한 입력을 오검출하지 않는다', () => {
      expect(containsBannedWord('카지노 홍보글')).toBe(true);
      expect(containsBannedWord('정상 댓글입니다')).toBe(false);
    });

    it('스팸/정상을 번갈아 호출해도 결과가 안정적이다', () => {
      const sequence = ['도박 사이트', '좋은 글이네요', '도박 사이트', '좋은 글이네요'];
      expect(sequence.map(containsBannedWord)).toEqual([true, false, true, false]);
    });
  });
});

describe('패턴 플래그 — 상태 오염 재발 방지 (개수 무관)', () => {
  it('어떤 패턴에도 g 플래그가 없다', () => {
    // g가 하나라도 섞이면 그 패턴의 lastIndex가 요청 간 누적돼
    // 스팸이 한 건 걸릴 때마다 다음 한 건이 통과한다.
    const withG = BANNED_PATTERNS.filter((p) => p.global).map((p) => p.source);
    expect(withG).toEqual([]);
  });

  it('모든 패턴이 대소문자를 무시한다', () => {
    const withoutI = BANNED_PATTERNS.filter((p) => !p.ignoreCase).map((p) => p.source);
    expect(withoutI).toEqual([]);
  });
});
