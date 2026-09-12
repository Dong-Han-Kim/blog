import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '@/lib/mdx';
import { tagHref } from '@/lib/routes';
import { SITE_URL } from '@/constants/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getPublishedPosts();

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const categories = [...new Set(posts.map((post) => post.category))];
  const categoryEntries: MetadataRoute.Sitemap = categories.map(
    (category) => ({
      // 태그(tagHref)와 동일하게 퍼센트 인코딩한다 — 카테고리명이 전부 영문 소문자인
      // 지금은 결과가 그대로지만, 한글·공백·특수문자 카테고리가 들어오면 이 인코딩이
      // 없어야 실제 페이지 URL(/categories/[category])과 sitemap이 어긋난다.
      url: `${SITE_URL}/categories/${encodeURIComponent(category)}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    }),
  );

  const tags = [...new Set(posts.flatMap((post) => post.tags))];
  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${SITE_URL}${tagHref(tag)}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...postEntries,
    ...categoryEntries,
    ...tagEntries,
  ];
}
