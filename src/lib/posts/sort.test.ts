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
          expect(prev.slug.localeCompare(curr.slug)).toBeLessThanOrEqual(0);
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
