import { describe, expect, it, vi } from 'vitest';

import type { PostMeta } from '@/types/common';
import { SITE_URL } from '@/constants/site';

/**
 * QA — 배포 산출물(feed.xml · search-index.json)이 페이지네이션에 오염되지 않는다.
 *
 * feat-list-pagination §9는 sitemap에 대해서만 "`?page=`를 넣지 않는다"를 테스트로 고정했다
 * (`sitemap.test.ts`). 그런데 **같은 글 집합에서 파생되는 산출물이 셋**이고, 나머지 둘에는
 * 가드가 없었다:
 *
 *   /sitemap.xml        ← ?page= 가드 있음
 *   /feed.xml           ← 없음
 *   /search-index.json  ← 없음
 *
 * 이 둘은 목록 라우트와 달리 "한 URL = 한 글"이어야 한다. 페이지네이션을 도입한 뒤
 * "피드도 페이지별로 나눌까", "검색 인덱스에 페이지 번호를 넣을까" 같은 선의의 변경이
 * 들어오면 RSS 리더가 같은 글을 중복 수신하고 검색 결과가 `?page=`가 붙은 목록 URL로 샌다.
 * 또 셋 중 하나만 필터 정책이 바뀌면 개수가 조용히 갈라진다 — 그래서 **셋의 개수를 함께** 잰다.
 *
 * `@/lib/mdx`는 파일시스템·MDX 파싱이 관심사가 아니므로 모킹한다 (sitemap.test.ts와 같은 기법).
 */

const posts: PostMeta[] = [
  {
    title: '최신 글',
    date: '2026-02-01',
    category: 'backend',
    tags: ['React'],
    description: '설명 1',
    keywords: ['k'],
    draft: false,
    slug: 'newer-post',
    readingTime: 3,
  },
  {
    title: '오래된 글 & 앰퍼샌드',
    date: '2026-01-01',
    category: '리눅스 팁',
    tags: ['특수 태그'],
    description: '설명 2',
    keywords: ['k'],
    draft: false,
    slug: 'older-post',
    readingTime: 1,
  },
];

vi.mock('@/lib/mdx', () => ({
  getPublishedPosts: () => posts,
}));

async function feedBody(): Promise<string> {
  const { GET } = await import('./feed.xml/route');
  return new Response((GET() as Response).body).text();
}

async function searchIndex(): Promise<Array<Record<string, unknown>>> {
  const { GET } = await import('./search-index.json/route');
  return (GET() as Response).json();
}

describe('feed.xml — 글 단위 URL만 담는다', () => {
  it('항목 수가 발행 글 수와 같다 (페이지 단위로 쪼개지지 않는다)', async () => {
    const xml = await feedBody();
    expect(xml.match(/<item>/g) ?? []).toHaveLength(posts.length);
  });

  it('?page= / ?sort= 가 한 건도 없다', async () => {
    const xml = await feedBody();
    expect(xml.includes('page=')).toBe(false);
    expect(xml.includes('sort=')).toBe(false);
  });

  it('link·guid는 목록 URL이 아니라 글 상세 URL이다', async () => {
    const xml = await feedBody();
    const links = [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1]);
    const postLinks = links.filter((l) => l !== SITE_URL && l !== `${SITE_URL}/`);
    expect(postLinks).toEqual([
      `${SITE_URL}/posts/newer-post`,
      `${SITE_URL}/posts/older-post`,
    ]);
  });

  it('정렬은 최신순 정본이다 (목록의 ?sort=와 무관하게 피드는 항상 최신순)', async () => {
    const xml = await feedBody();
    expect(xml.indexOf('newer-post')).toBeLessThan(xml.indexOf('older-post'));
  });
});

describe('search-index.json — 글 단위 항목만 담는다', () => {
  it('항목 수가 발행 글 수와 같다', async () => {
    expect(await searchIndex()).toHaveLength(posts.length);
  });

  it('직렬화 결과 어디에도 page=/sort= 가 없다', async () => {
    const raw = JSON.stringify(await searchIndex());
    expect(raw.includes('page=')).toBe(false);
    expect(raw.includes('sort=')).toBe(false);
  });

  it('slug만 담고 완성된 목록 URL을 담지 않는다 (경로 조립은 소비처의 몫)', async () => {
    const index = await searchIndex();
    expect(index.map((e) => e.slug)).toEqual(['newer-post', 'older-post']);
    expect(JSON.stringify(index)).not.toContain('/posts?');
    expect(JSON.stringify(index)).not.toContain('/tags?');
  });
});

describe('세 산출물이 같은 글 집합을 본다', () => {
  it('sitemap의 글 URL 수 · feed 항목 수 · search-index 항목 수가 일치한다', async () => {
    const { default: sitemap } = await import('./sitemap');
    const sitemapPostUrls = sitemap().filter((e) =>
      e.url.startsWith(`${SITE_URL}/posts/`),
    );
    const xml = await feedBody();
    const index = await searchIndex();

    expect(sitemapPostUrls).toHaveLength(posts.length);
    expect(xml.match(/<item>/g) ?? []).toHaveLength(posts.length);
    expect(index).toHaveLength(posts.length);
  });
});
