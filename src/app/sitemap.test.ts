import { describe, expect, it, vi } from 'vitest';

import type { PostMeta } from '@/types/common';
import { SITE_URL } from '@/constants/site';

/**
 * sitemap.ts 카테고리·태그 URL 인코딩 계약.
 *
 * ⚠️ 태그는 tagHref로 퍼센트 인코딩하면서 카테고리(`/categories/${category}`)는
 *   생값을 그대로 이어붙였다 — 카테고리명이 전부 영문 소문자라 지금은 드러나지 않지만,
 *   한글·공백·특수문자 카테고리가 들어오면 sitemap 링크와 실제 페이지 URL이 어긋난다
 *   (docs/codebase/content.md의 "알아둘 것" 항목 근거). 파일시스템·MDX 파싱은 관심사가
 *   아니므로 @/lib/mdx를 모킹한다.
 */

const posts: PostMeta[] = [
  {
    title: '영문 카테고리 글',
    date: '2026-01-01',
    category: 'til',
    tags: ['linux'],
    description: '설명',
    keywords: ['k'],
    draft: false,
    slug: 'ascii-post',
    readingTime: 1,
  },
  {
    title: '한글 카테고리 글',
    date: '2026-01-02',
    category: '리눅스 팁',
    tags: ['특수 태그'],
    description: '설명',
    keywords: ['k'],
    draft: false,
    slug: 'hangul-category-post',
    readingTime: 1,
  },
];

vi.mock('@/lib/mdx', () => ({
  getPublishedPosts: () => posts,
}));

describe('sitemap — 카테고리 URL 인코딩', () => {
  it('한글·공백 카테고리는 태그처럼 퍼센트 인코딩한다', async () => {
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const categoryEntry = entries.find((e) =>
      e.url.startsWith(`${SITE_URL}/categories/`) && e.url.includes('%'),
    );
    expect(categoryEntry?.url).toBe(
      `${SITE_URL}/categories/${encodeURIComponent('리눅스 팁')}`,
    );
    // 실제 페이지 라우트(/categories/[category])가 받는 값과 디코딩 결과가 같아야 한다
    expect(decodeURIComponent(categoryEntry!.url.split('/categories/')[1])).toBe(
      '리눅스 팁',
    );
  });

  it('영문 카테고리는 인코딩 전후로 URL이 그대로다 (기존 URL 하위호환)', async () => {
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const categoryEntry = entries.find(
      (e) => e.url === `${SITE_URL}/categories/til`,
    );
    expect(categoryEntry).toBeDefined();
  });
});
