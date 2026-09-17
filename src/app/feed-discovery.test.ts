import { describe, expect, it, vi } from 'vitest';

import type { PostMeta } from '@/types/common';
import { FEED_PATH, RSS_ALTERNATE_TYPES, SITE_URL } from '@/constants/site';

/**
 * 회귀 테스트 — 목록 4라우트가 RSS 자동탐색 링크를 잃지 않는다 (리뷰 H-1).
 *
 * Next의 메타데이터 병합은 **최상위 키 단위 치환**이고 깊은 병합이 아니다
 * (`next/dist/lib/metadata/resolve-metadata.js`의 `case 'alternates'`). 그래서 라우트가
 * `alternates: { canonical }`만 돌려주면 layout이 주던 `alternates.types`가 통째로 사라진다.
 * 실제로 canonical을 추가한 순간 `/` `/posts` `/categories/*` `/tags/*` 네 곳에서
 * 피드 자동탐색이 죽었는데 `/feed.xml` 라우트는 멀쩡해 빌드·테스트·화면 어디에도 신호가 없었다.
 *
 * 그래서 두 가지를 함께 고정한다:
 *   ① `alternates.types['application/rss+xml']`가 **네 라우트 전 분기에서** 살아 있다
 *   ② 그 값이 `@/constants/site`의 **같은 객체**다 (참조 비교) — 하드코딩 복붙을 막는다.
 *      피드 경로가 바뀔 때 고칠 곳이 다섯으로 갈라지면 ①이 다시 조용히 깨진다.
 *
 * `@/lib/mdx`는 파일시스템·MDX 파싱이 관심사가 아니므로 모킹한다 (sitemap.test.ts와 같은 기법).
 */

const post = (slug: string, overrides: Partial<PostMeta> = {}): PostMeta => ({
  title: slug,
  date: '2026-01-01',
  category: 'backend',
  tags: ['React'],
  description: '설명',
  keywords: ['k'],
  draft: false,
  slug,
  readingTime: 1,
  ...overrides,
});

// 페이지당 20건이므로 25건이면 2페이지 — 범위 안(page=2)과 범위 밖(page=99)을 모두 만든다
const posts: PostMeta[] = Array.from({ length: 25 }, (_, i) =>
  post(`post-${String(i).padStart(2, '0')}`),
);

vi.mock('@/lib/mdx', () => ({
  getAllPosts: () => posts,
  getPublishedPosts: () => posts.filter((p) => !p.draft),
  getPostsByCategory: (category: string) =>
    posts.filter((p) => p.category === category),
}));

type Meta = Awaited<ReturnType<typeof import('./page').generateMetadata>>;

/** 라우트별로 (설명, ok 경로 호출, 비-ok 경로 호출)을 모은다 */
const routes: Array<{
  name: string;
  ok: () => Promise<Meta>;
  notOk: () => Promise<Meta>;
}> = [
  {
    name: '/ (홈)',
    ok: async () =>
      (await import('./page')).generateMetadata({
        searchParams: Promise.resolve({ page: '2' }),
      }),
    notOk: async () =>
      (await import('./page')).generateMetadata({
        searchParams: Promise.resolve({ page: '99' }),
      }),
  },
  {
    name: '/posts',
    ok: async () =>
      (await import('./posts/page')).generateMetadata({
        searchParams: Promise.resolve({ page: '2' }),
      }),
    notOk: async () =>
      (await import('./posts/page')).generateMetadata({
        searchParams: Promise.resolve({ page: '99' }),
      }),
  },
  {
    name: '/categories/[category]',
    ok: async () =>
      (await import('./categories/[category]/page')).generateMetadata({
        params: Promise.resolve({ category: 'backend' }),
        searchParams: Promise.resolve({ page: '2' }),
      }),
    notOk: async () =>
      (await import('./categories/[category]/page')).generateMetadata({
        params: Promise.resolve({ category: 'backend' }),
        searchParams: Promise.resolve({ page: '99' }),
      }),
  },
  {
    name: '/tags/[tag]',
    ok: async () =>
      (await import('./tags/[tag]/page')).generateMetadata({
        params: Promise.resolve({ tag: 'React' }),
        searchParams: Promise.resolve({ page: '2' }),
      }),
    notOk: async () =>
      (await import('./tags/[tag]/page')).generateMetadata({
        params: Promise.resolve({ tag: 'React' }),
        searchParams: Promise.resolve({ page: '99' }),
      }),
  },
];

describe.each(routes)('$name — RSS 자동탐색 링크가 살아 있다', ({ ok, notOk }) => {
  it('정상 페이지: canonical과 함께 rss+xml을 싣는다', async () => {
    const meta = await ok();
    // canonical이 실제로 설정된 분기여야 이 테스트가 의미가 있다 — 치환이 일어나는 조건 자체다
    expect(String(meta.alternates?.canonical)).toContain(`${SITE_URL}/`);
    expect(meta.alternates?.types?.['application/rss+xml']).toBe(FEED_PATH);
  });

  it('정상 페이지: 값이 정본 상수와 같은 객체다 (하드코딩 복붙 금지)', async () => {
    const meta = await ok();
    expect(meta.alternates?.types).toBe(RSS_ALTERNATE_TYPES);
  });

  it('범위 밖 ?page= (404로 갈 경로)에서도 링크가 남는다', async () => {
    const meta = await notOk();
    expect(meta.alternates?.types?.['application/rss+xml']).toBe(FEED_PATH);
  });
});

describe('태그 라우트의 0건 분기', () => {
  it('발행 글이 0건인 태그(404로 갈 경로)에서도 링크가 남는다', async () => {
    const meta = await (
      await import('./tags/[tag]/page')
    ).generateMetadata({
      params: Promise.resolve({ tag: '존재하지-않는-태그' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.types?.['application/rss+xml']).toBe(FEED_PATH);
  });
});

describe('정본 상수', () => {
  it('피드 경로는 feed.xml 라우트 하나를 가리킨다', () => {
    expect(FEED_PATH).toBe('/feed.xml');
    expect(RSS_ALTERNATE_TYPES).toEqual({ 'application/rss+xml': '/feed.xml' });
  });
});
