import { describe, expect, it } from 'vitest';

import type { PostMeta } from '@/types/common';

import { DEFAULT_POST_SORT, sortPostsByDate } from './sort';

let seq = 0;
function makePost(overrides: Partial<PostMeta> = {}): PostMeta {
  seq += 1;
  return {
    title: `post-${seq}`,
    date: '2026-01-01',
    category: 'til',
    tags: ['test'],
    description: null,
    slug: overrides.slug ?? `post-${seq}`,
    draft: false,
    keywords: ['test'],
    readingTime: 3,
    ...overrides,
  };
}

function slugs(posts: PostMeta[]): string[] {
  return posts.map((post) => post.slug);
}

/** 배열의 모든 순열 — comparator total order(순열 불변) 검증용 */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe('sortPostsByDate (설계 §3.3 목록 정렬 정본)', () => {
  it('newest면 date 내림차순으로 정렬한다', () => {
    const sorted = sortPostsByDate(
      [
        makePost({ slug: 'mid', date: '2026-02-01' }),
        makePost({ slug: 'old', date: '2026-01-01' }),
        makePost({ slug: 'new', date: '2026-03-01' }),
      ],
      'newest',
    );
    expect(slugs(sorted)).toEqual(['new', 'mid', 'old']);
  });

  it('oldest면 date 오름차순으로 정렬한다', () => {
    const sorted = sortPostsByDate(
      [
        makePost({ slug: 'mid', date: '2026-02-01' }),
        makePost({ slug: 'old', date: '2026-01-01' }),
        makePost({ slug: 'new', date: '2026-03-01' }),
      ],
      'oldest',
    );
    expect(slugs(sorted)).toEqual(['old', 'mid', 'new']);
  });

  it('order 생략 시 기본값(DEFAULT_POST_SORT = newest)을 쓴다', () => {
    expect(DEFAULT_POST_SORT).toBe('newest');
    const sorted = sortPostsByDate([
      makePost({ slug: 'old', date: '2026-01-01' }),
      makePost({ slug: 'new', date: '2026-03-01' }),
    ]);
    expect(slugs(sorted)).toEqual(['new', 'old']);
  });

  it('동일 date는 순서와 무관하게 slug 오름차순 tie-break (결정성)', () => {
    const posts = [
      makePost({ slug: 'zebra', date: '2026-01-01' }),
      makePost({ slug: 'alpha', date: '2026-01-01' }),
      makePost({ slug: 'later', date: '2026-02-01' }),
    ];
    expect(slugs(sortPostsByDate(posts, 'newest'))).toEqual([
      'later',
      'alpha',
      'zebra',
    ]);
    expect(slugs(sortPostsByDate(posts, 'oldest'))).toEqual([
      'alpha',
      'zebra',
      'later',
    ]);
  });

  it('동일 date + 같은 시리즈 + seriesOrder는 direction을 따른다 (newest면 후속편이 먼저)', () => {
    const posts = [
      makePost({
        slug: 'linux-commands-1-basics',
        date: '2026-08-26',
        series: '리눅스 명령어',
        seriesOrder: 1,
      }),
      makePost({
        slug: 'linux-commands-2-server-ops',
        date: '2026-08-26',
        series: '리눅스 명령어',
        seriesOrder: 2,
      }),
    ];
    expect(slugs(sortPostsByDate(posts, 'newest'))).toEqual([
      'linux-commands-2-server-ops',
      'linux-commands-1-basics',
    ]);
    expect(slugs(sortPostsByDate(posts, 'oldest'))).toEqual([
      'linux-commands-1-basics',
      'linux-commands-2-server-ops',
    ]);
  });

  it('동일 date라도 다른 시리즈(또는 시리즈 없음)면 그룹 키(시리즈명/slug) 오름차순으로 방향 무관하게 정렬한다', () => {
    const posts = [
      makePost({
        slug: 'zebra',
        date: '2026-01-01',
        series: '시리즈 A',
        seriesOrder: 1,
      }),
      makePost({
        slug: 'alpha',
        date: '2026-01-01',
        series: '시리즈 B',
        seriesOrder: 2,
      }),
      makePost({ slug: 'mango', date: '2026-01-01' }),
    ];
    // groupKey: mango(slug) < 시리즈 A(zebra) < 시리즈 B(alpha) — 코드 유닛 비교에서 Latin < Hangul (로케일 무관)
    expect(slugs(sortPostsByDate(posts, 'newest'))).toEqual([
      'mango',
      'zebra',
      'alpha',
    ]);
    expect(slugs(sortPostsByDate(posts, 'oldest'))).toEqual([
      'mango',
      'zebra',
      'alpha',
    ]);
  });

  it('동일 date + 같은 시리즈여도 한쪽만 seriesOrder가 있으면 비소속(그룹 키=slug)으로 취급한다', () => {
    const posts = [
      makePost({
        slug: 'zebra',
        date: '2026-01-01',
        series: '같은 시리즈',
        seriesOrder: 1,
      }),
      makePost({ slug: 'alpha', date: '2026-01-01', series: '같은 시리즈' }),
    ];
    expect(slugs(sortPostsByDate(posts, 'newest'))).toEqual(['alpha', 'zebra']);
    expect(slugs(sortPostsByDate(posts, 'oldest'))).toEqual(['alpha', 'zebra']);
  });

  it('시리즈명은 trim 후 비교한다 (공백 차이는 같은 시리즈)', () => {
    const posts = [
      makePost({
        slug: 'part-1',
        date: '2026-01-01',
        series: ' 리눅스 명령어 ',
        seriesOrder: 1,
      }),
      makePost({
        slug: 'part-2',
        date: '2026-01-01',
        series: '리눅스 명령어',
        seriesOrder: 2,
      }),
    ];
    expect(slugs(sortPostsByDate(posts, 'newest'))).toEqual([
      'part-2',
      'part-1',
    ]);
  });

  it('원본 배열을 변형하지 않는다 (복사 정렬)', () => {
    const posts = [
      makePost({ slug: 'b', date: '2026-01-02' }),
      makePost({ slug: 'a', date: '2026-01-01' }),
    ];
    const snapshot = [...posts];
    sortPostsByDate(posts, 'oldest');
    expect(posts).toEqual(snapshot);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(sortPostsByDate([], 'newest')).toEqual([]);
    expect(sortPostsByDate([], 'oldest')).toEqual([]);
  });

  // --- QA 보강 케이스 (sort-controls §5) ---

  it('단일 요소 배열은 그대로 1건을 반환한다 (양쪽 방향)', () => {
    const only = makePost({ slug: 'solo', date: '2026-05-05' });
    expect(slugs(sortPostsByDate([only], 'newest'))).toEqual(['solo']);
    expect(slugs(sortPostsByDate([only], 'oldest'))).toEqual(['solo']);
  });

  it('동일 date·동일 slug 중복 항목이 있어도 전 요소가 보존된다', () => {
    const posts = [
      makePost({ slug: 'dup', date: '2026-01-01', title: 'first' }),
      makePost({ slug: 'dup', date: '2026-01-01', title: 'second' }),
      makePost({ slug: 'aaa', date: '2026-01-01' }),
    ];
    const sorted = sortPostsByDate(posts, 'newest');
    expect(sorted).toHaveLength(3);
    expect(slugs(sorted)).toEqual(['aaa', 'dup', 'dup']);
  });

  it('대량(200건) 무작위 입력에서도 정렬 불변식을 만족한다', () => {
    // 불변식: newest = date desc, oldest = date asc, 동일 date는 항상 slug asc
    const dates = ['2026-01-01', '2026-02-15', '2026-03-30', '2026-07-04'];
    const posts = Array.from({ length: 200 }, (_, i) =>
      makePost({
        slug: `p-${String((i * 37) % 200).padStart(3, '0')}`,
        date: dates[(i * 13) % dates.length],
      }),
    );

    const assertInvariant = (sorted: PostMeta[], newestFirst: boolean) => {
      expect(sorted).toHaveLength(posts.length);
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev.date === curr.date) {
          // 코드 유닛 비교 — 구현과 동일하게 로케일 무관이어야 어느 환경에서든 검증이 성립
          expect(prev.slug <= curr.slug).toBe(true);
        } else if (newestFirst) {
          expect(prev.date > curr.date).toBe(true);
        } else {
          expect(prev.date < curr.date).toBe(true);
        }
      }
    };

    assertInvariant(sortPostsByDate(posts, 'newest'), true);
    assertInvariant(sortPostsByDate(posts, 'oldest'), false);
  });

  // --- 리뷰 반영: total order(추이성) 검증 — 순열 불변 케이스 ---

  it('동일 date에 시리즈 연작 + slug가 그 사이에 끼는 비시리즈 글이 섞여도 모든 입력 순열이 동일한 출력을 낸다', () => {
    // 쌍 단위 분기 구현에서는 cmp(A,B)/cmp(A,X)/cmp(B,X)가 순환해 입력 순서마다
    // 출력이 달랐다 ([B,X,A] 입력이면 1편이 2편보다 앞에 오는 회귀 재현).
    const partOne = makePost({
      slug: 'linux-commands-1-basics',
      date: '2026-08-26',
      series: '리눅스 명령어',
      seriesOrder: 1,
    });
    const partTwo = makePost({
      slug: 'linux-commands-2-server-ops',
      date: '2026-08-26',
      series: '리눅스 명령어',
      seriesOrder: 2,
    });
    const standalone = makePost({
      slug: 'linux-commands-1z-cheatsheet',
      date: '2026-08-26',
    });

    // groupKey: slug(Latin) < 시리즈명(Hangul) → 비시리즈 글이 먼저, 시리즈 연작은 인접
    const expectedNewest = [
      'linux-commands-1z-cheatsheet',
      'linux-commands-2-server-ops',
      'linux-commands-1-basics',
    ];
    const expectedOldest = [
      'linux-commands-1z-cheatsheet',
      'linux-commands-1-basics',
      'linux-commands-2-server-ops',
    ];

    for (const input of permutations([partOne, partTwo, standalone])) {
      expect(slugs(sortPostsByDate(input, 'newest'))).toEqual(expectedNewest);
      expect(slugs(sortPostsByDate(input, 'oldest'))).toEqual(expectedOldest);
    }
  });

  it('같은 시리즈 3편 중 1편만 seriesOrder가 없어도 모든 입력 순열이 동일한 출력을 낸다', () => {
    // order 없는 글은 비소속(그룹 키=slug)으로 취급 — 같은 클래스의 순환을 차단
    const partOne = makePost({
      slug: 'linux-commands-1-basics',
      date: '2026-08-26',
      series: '리눅스 명령어',
      seriesOrder: 1,
    });
    const partTwo = makePost({
      slug: 'linux-commands-2-server-ops',
      date: '2026-08-26',
      series: '리눅스 명령어',
      seriesOrder: 2,
    });
    const orderless = makePost({
      slug: 'linux-commands-appendix',
      date: '2026-08-26',
      series: '리눅스 명령어',
    });

    const expectedNewest = [
      'linux-commands-appendix',
      'linux-commands-2-server-ops',
      'linux-commands-1-basics',
    ];
    const expectedOldest = [
      'linux-commands-appendix',
      'linux-commands-1-basics',
      'linux-commands-2-server-ops',
    ];

    for (const input of permutations([partOne, partTwo, orderless])) {
      expect(slugs(sortPostsByDate(input, 'newest'))).toEqual(expectedNewest);
      expect(slugs(sortPostsByDate(input, 'oldest'))).toEqual(expectedOldest);
    }
  });

  it('이미 정렬된 입력을 다시 정렬해도 결과가 같다 (멱등성)', () => {
    const posts = [
      makePost({ slug: 'c', date: '2026-03-01' }),
      makePost({ slug: 'a', date: '2026-01-01' }),
      makePost({ slug: 'b', date: '2026-01-01' }),
    ];
    const once = sortPostsByDate(posts, 'newest');
    const twice = sortPostsByDate(once, 'newest');
    expect(slugs(twice)).toEqual(slugs(once));
  });
});
