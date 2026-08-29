import { describe, expect, it } from 'vitest';

import type { PostMeta } from '@/types/common';

import { compareStrings, sortPostsByDate } from './sort';

/**
 * QA 계약 테스트 (reuse-audit 최종 게이트).
 * 기존 sort.test.ts가 골든 케이스를 고정한다면, 이 파일은 **대수적 성질**을 고정한다.
 * compareStrings는 A-3에서 고친 반대칭성 위반 버그의 재발 지점이고,
 * sortPostsByDate의 total order는 여기서 파생되므로 성질이 깨지면 정렬 전체가 무너진다.
 */

/** 로케일·스크립트·대소문자·공백·구두점·이모지·서로게이트를 섞은 비교 코퍼스 */
const CORPUS = [
  '',
  ' ',
  '  ',
  '-',
  '.',
  '0',
  '9',
  'A',
  'B',
  'Z',
  'a',
  'b',
  'z',
  'A&B',
  'a-b',
  'ab',
  'Next.js',
  'next.js',
  'CLI',
  'cli',
  'glibc',
  'ldd',
  'systemd',
  'Shared Library',
  'SharedLibrary',
  'Virtual DOM',
  '가',
  '글',
  '서버운영',
  '터미널',
  '리눅스 명령어',
  '리눅스명령어',
  'é', // é (합성)
  'é', // é (결합 문자)
  '\u{1F600}', // 😀 (서로게이트 페어)
  '�',
];

describe('compareStrings — 전순서(total order) 대수적 성질', () => {
  it('반환값은 -1 / 0 / 1 뿐이다 (부호만 쓰는 호출부도 있으므로 값 자체를 고정)', () => {
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        expect([-1, 0, 1]).toContain(compareStrings(a, b));
      }
    }
  });

  it('반사성: cmp(a, a) === 0', () => {
    for (const a of CORPUS) expect(compareStrings(a, a)).toBe(0);
  });

  // ★ A-3에서 고친 원래 버그가 반대칭성 위반이었다 — 여기가 그 회귀 지점이다
  it('반대칭성: cmp(a, b) === -cmp(b, a) (전 조합)', () => {
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        // `|| 0` 은 -0 정규화 (Object.is(-0, 0) === false)
        expect(compareStrings(a, b)).toBe(-compareStrings(b, a) || 0);
      }
    }
  });

  it('식별불능성: cmp(a, b) === 0 이면 a === b (동치류가 하나뿐)', () => {
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        if (compareStrings(a, b) === 0) expect(a).toBe(b);
      }
    }
  });

  it('추이성: cmp(a,b) <= 0 && cmp(b,c) <= 0 이면 cmp(a,c) <= 0 (전 3중 조합)', () => {
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        if (compareStrings(a, b) > 0) continue;
        for (const c of CORPUS) {
          if (compareStrings(b, c) > 0) continue;
          expect(compareStrings(a, c)).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('sort 결과가 입력 순열과 무관하다 (comparator가 전순서임의 실증)', () => {
    const sample = ['터미널', 'CLI', 'a-b', '', 'Next.js', 'ab', '글', ' '];
    const golden = [...sample].sort(compareStrings);
    for (let shift = 0; shift < sample.length; shift += 1) {
      const rotated = [...sample.slice(shift), ...sample.slice(0, shift)];
      expect([...rotated].sort(compareStrings)).toEqual(golden);
    }
    expect([...sample].reverse().sort(compareStrings)).toEqual(golden);
  });
});

describe('compareStrings — 로케일 독립성', () => {
  it('UTF-16 코드 유닛 순서(< 연산자)와 항상 일치한다', () => {
    for (const a of CORPUS) {
      for (const b of CORPUS) {
        const codeUnit = a < b ? -1 : a > b ? 1 : 0;
        expect(compareStrings(a, b)).toBe(codeUnit);
      }
    }
  });

  it('빈 문자열은 항상 최소값이다', () => {
    for (const a of CORPUS) {
      if (a === '') continue;
      expect(compareStrings('', a)).toBe(-1);
      expect(compareStrings(a, '')).toBe(1);
    }
  });

  // ★ localeCompare가 다시 스며들면 이 케이스들이 즉시 깨진다
  it.each([
    ['A', 'a', -1], // localeCompare(en/ko) → 1 (소문자 우선)
    ['B', 'a', -1], // localeCompare → 1
    ['Next.js', 'ldd', -1], // localeCompare → 1 (l < n)
    ['Virtual DOM', 'glibc', -1], // localeCompare → 1
    ['터미널', 'zzz', 1], // localeCompare(ko) → -1, (en) → 1 : 환경 의존
    ['글', 'A', 1], // localeCompare(ko) → -1
  ])('대소문자·스크립트 갈림 지점: cmp(%s, %s) === %i', (a, b, expected) => {
    expect(compareStrings(a, b)).toBe(expected);
  });

  it('한글↔Latin 결과가 en/ko localeCompare 어느 쪽과도 무관하게 고정된다', () => {
    // 이 단언 자체가 "환경 로케일이 바뀌어도 compareStrings는 안 움직인다"의 증거다.
    const koFlips = '터미널'.localeCompare('zzz', 'ko');
    const enFlips = '터미널'.localeCompare('zzz', 'en');
    expect(Math.sign(koFlips)).not.toBe(Math.sign(enFlips)); // 전제: 실제로 갈린다
    expect(compareStrings('터미널', 'zzz')).toBe(1); // 그럼에도 결과는 고정
  });

  it('결합 문자와 합성 문자를 정규화하지 않는다 (NFC 정규화는 계약이 아니다)', () => {
    expect(compareStrings('é', 'é')).not.toBe(0);
  });
});

let seq = 0;
function makePost(overrides: Partial<PostMeta> = {}): PostMeta {
  seq += 1;
  return {
    title: `t-${seq}`,
    date: '2026-01-01',
    category: 'til',
    tags: ['t'],
    description: null,
    slug: `s-${seq}`,
    draft: false,
    keywords: ['k'],
    readingTime: 1,
    ...overrides,
  };
}

/** 시드 고정 LCG — 무작위지만 재현 가능한 퍼즈 입력 */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('sortPostsByDate — 퍼즈 기반 결정성', () => {
  // 시리즈/비시리즈/order 누락/동일 날짜가 뒤섞인 모집단을 무작위 셔플해도
  // 결과가 항상 동일해야 한다. 쌍 단위 분기 구현의 순환은 여기서 잡힌다.
  const population: PostMeta[] = [
    makePost({ slug: 'a-1', date: '2026-08-26', series: '리눅스 명령어', seriesOrder: 1 }),
    makePost({ slug: 'a-2', date: '2026-08-26', series: '리눅스 명령어', seriesOrder: 2 }),
    makePost({ slug: 'a-3', date: '2026-08-26', series: '리눅스 명령어', seriesOrder: 3 }),
    makePost({ slug: 'a-x', date: '2026-08-26', series: '리눅스 명령어' }), // order 누락
    makePost({ slug: 'b-1', date: '2026-08-26', series: 'React 렌더링', seriesOrder: 1 }),
    makePost({ slug: 'b-2', date: '2026-08-26', series: 'React 렌더링', seriesOrder: 2 }),
    makePost({ slug: 'zzz', date: '2026-08-26' }),
    makePost({ slug: 'Aaa', date: '2026-08-26' }), // 대문자 slug
    makePost({ slug: 'c-1', date: '2026-08-27' }),
    makePost({ slug: 'c-2', date: '2026-08-25' }),
    makePost({ slug: 'd-1', date: '2026-08-26', series: '  공백  ', seriesOrder: 2 }),
    makePost({ slug: 'd-2', date: '2026-08-26', series: '공백', seriesOrder: 1 }),
  ];

  it.each(['newest', 'oldest'] as const)(
    '%s: 200회 무작위 셔플이 전부 같은 순서를 낸다',
    (order) => {
      const rand = makeRng(20260829);
      const golden = sortPostsByDate(population, order).map((p) => p.slug);
      for (let i = 0; i < 200; i += 1) {
        expect(sortPostsByDate(shuffled(population, rand), order).map((p) => p.slug)).toEqual(
          golden,
        );
      }
    },
  );

  it.each(['newest', 'oldest'] as const)(
    '%s: 정렬 결과가 comparator를 다시 적용해도 자기 자신과 일치한다 (멱등)',
    (order) => {
      const once = sortPostsByDate(population, order);
      expect(sortPostsByDate(once, order)).toEqual(once);
    },
  );

  it('newest 결과는 oldest 결과의 단순 역순이 아니다 (그룹 키 축은 방향 무관)', () => {
    // 이 성질이 깨지면 groupKey/slug 축에 direction이 잘못 곱해진 것이다
    const newest = sortPostsByDate(population, 'newest').map((p) => p.slug);
    const oldest = sortPostsByDate(population, 'oldest').map((p) => p.slug);
    expect(newest).not.toEqual([...oldest].reverse());
  });

  it('전 요소가 보존되고 어떤 원소도 잃거나 복제되지 않는다', () => {
    for (const order of ['newest', 'oldest'] as const) {
      const sorted = sortPostsByDate(population, order);
      expect(sorted).toHaveLength(population.length);
      expect([...sorted].sort((a, b) => compareStrings(a.slug, b.slug))).toEqual(
        [...population].sort((a, b) => compareStrings(a.slug, b.slug)),
      );
    }
  });

  it('date가 전부 동일하면 순서는 오직 groupKey/slug로 결정된다 (방향 무관)', () => {
    const sameDate = population.filter((p) => p.date === '2026-08-26');
    const newest = sortPostsByDate(sameDate, 'newest').map((p) => p.slug);
    const oldest = sortPostsByDate(sameDate, 'oldest').map((p) => p.slug);
    // 시리즈 내부 순서만 뒤집히고 그룹 배치는 같다
    const groupsOf = (slugs: string[]) => slugs.map((s) => s.replace(/-\d+$|-x$/, ''));
    expect(groupsOf(newest)).toEqual(groupsOf(oldest));
  });

  it('대량 입력(1000건)에서도 인접 쌍 불변식을 만족한다', () => {
    const rand = makeRng(7);
    const dates = ['2026-01-01', '2026-05-05', '2026-08-26'];
    const many = Array.from({ length: 1000 }, (_, i) =>
      makePost({
        slug: `p-${String(Math.floor(rand() * 1000)).padStart(4, '0')}-${i}`,
        date: dates[i % dates.length],
      }),
    );
    const sorted = sortPostsByDate(many, 'newest');
    expect(sorted).toHaveLength(1000);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i - 1].date === sorted[i].date) {
        expect(compareStrings(sorted[i - 1].slug, sorted[i].slug)).toBeLessThan(0);
      } else {
        expect(sorted[i - 1].date > sorted[i].date).toBe(true);
      }
    }
  });
});
