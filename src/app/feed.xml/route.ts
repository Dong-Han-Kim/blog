import { getPublishedPosts } from '@/lib/mdx';
import { sortPostsByDate } from '@/lib/posts/sort';
import { SITE_URL } from '@/constants/site';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function GET() {
  // 정렬은 정본 함수(lib/posts/sort.ts, 기본 newest) — 피드는 draft 필터만
  const posts = sortPostsByDate(getPublishedPosts());

  const items = posts
    .map(
      (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/posts/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/posts/${post.slug}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <category>${escapeXml(post.category)}</category>
      ${post.description ? `<description>${escapeXml(post.description)}</description>` : ''}
    </item>`
    )
    .join('');

  // 피드 채널명은 사용자에게 노출되는 브랜드 표시명이므로 b.log() (결정 D-1ⓒ).
  // blog92는 호스트명 은유(PromptLine의 `blog92@web:~$`, error.tsx의 `./blog92 --render`,
  // 폴백 도메인)에만 쓰는 시스템 식별자라 그대로 둔다.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>b.log()</title>
    <link>${SITE_URL}</link>
    <description>b.log() 기술 블로그</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
