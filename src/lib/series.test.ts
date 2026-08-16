import { describe, expect, it } from 'vitest';

import type { PostMeta } from '@/types/common';

import { getPostsBySeries, getSeriesForPost, sortSeriesPosts } from './mdx';

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

describe('sortSeriesPosts (설계 §3.1 정렬 정본)', () => {
  it('seriesOrder 정상 지정 시 order 오름차순', () => {
    const sorted = sortSeriesPosts([
      makePost({ slug: 'c', seriesOrder: 3 }),
      makePost({ slug: 'a', seriesOrder: 1 }),
      makePost({ slug: 'b', seriesOrder: 2 }),
    ]);
    expect(slugs(sorted)).toEqual(['a', 'b', 'c']);
  });

  it('order 중복 시 date → slug 폴백으로 결정적 정렬', () => {
    const sorted = sortSeriesPosts([
      makePost({ slug: 'late', seriesOrder: 1, date: '2026-02-01' }),
      makePost({ slug: 'z-early', seriesOrder: 1, date: '2026-01-01' }),
      makePost({ slug: 'a-early', seriesOrder: 1, date: '2026-01-01' }),
      makePost({ slug: 'second', seriesOrder: 2 }),
    ]);
    expect(slugs(sorted)).toEqual(['a-early', 'z-early', 'late', 'second']);
  });

  it('order 누락 편은 Infinity 취급으로 order 있는 편들 뒤에 date순 배치', () => {
    const sorted = sortSeriesPosts([
      makePost({ slug: 'no-order-late', date: '2026-03-01' }),
      makePost({ slug: 'ordered-7', seriesOrder: 7 }),
      makePost({ slug: 'no-order-early', date: '2026-02-01' }),
      makePost({ slug: 'ordered-1', seriesOrder: 1 }),
    ]);
    expect(slugs(sorted)).toEqual([
      'ordered-1',
      'ordered-7',
      'no-order-early',
      'no-order-late',
    ]);
  });

  it('전부 order 누락이면 사실상 date순 시리즈로 동작', () => {
    const sorted = sortSeriesPosts([
      makePost({ slug: 'third', date: '2026-03-01' }),
      makePost({ slug: 'first', date: '2026-01-01' }),
      makePost({ slug: 'second', date: '2026-02-01' }),
    ]);
    expect(slugs(sorted)).toEqual(['first', 'second', 'third']);
  });

  it('date 전부 동일 + order 지정 (proxy 3부작 케이스) — order대로', () => {
    const sorted = sortSeriesPosts([
      makePost({ slug: 'javascript-proxy-reflect-patterns', seriesOrder: 3, date: '2026-04-13' }),
      makePost({ slug: 'javascript-proxy-why', seriesOrder: 1, date: '2026-04-13' }),
      makePost({ slug: 'javascript-proxy-mechanics', seriesOrder: 2, date: '2026-04-13' }),
    ]);
    expect(slugs(sorted)).toEqual([
      'javascript-proxy-why',
      'javascript-proxy-mechanics',
      'javascript-proxy-reflect-patterns',
    ]);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const input = [
      makePost({ slug: 'b', seriesOrder: 2 }),
      makePost({ slug: 'a', seriesOrder: 1 }),
    ];
    sortSeriesPosts(input);
    expect(slugs(input)).toEqual(['b', 'a']);
  });
});

describe('실제 콘텐츠 통합 (content/posts 파일시스템)', () => {
  it('JavaScript Proxy Deep Dive — 3편이 why → mechanics → reflect-patterns 순', () => {
    const posts = getPostsBySeries('JavaScript Proxy Deep Dive');
    expect(slugs(posts)).toEqual([
      'javascript-proxy-why',
      'javascript-proxy-mechanics',
      'javascript-proxy-reflect-patterns',
    ]);
  });

  it('가운데 편의 시리즈 컨텍스트 — currentIndex 1, prev/next 연결', () => {
    const series = getSeriesForPost('javascript-proxy-mechanics');
    expect(series).not.toBeNull();
    expect(series?.name).toBe('JavaScript Proxy Deep Dive');
    expect(series?.currentIndex).toBe(1);
    expect(series?.prev?.slug).toBe('javascript-proxy-why');
    expect(series?.next?.slug).toBe('javascript-proxy-reflect-patterns');
  });

  it('단일 편 시리즈 (react-rendering-principles) — 1편, prev/next null', () => {
    const series = getSeriesForPost('react-rendering-principles');
    expect(series?.posts).toHaveLength(1);
    expect(series?.currentIndex).toBe(0);
    expect(series?.prev).toBeNull();
    expect(series?.next).toBeNull();
  });

  it('시리즈 미소속 글 — null', () => {
    expect(getSeriesForPost('docker-deep-dive')).toBeNull();
  });
});
