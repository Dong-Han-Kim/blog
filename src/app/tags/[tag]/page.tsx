import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostsByTag, getPublishedPosts } from '@/lib/mdx';
import { countTags, sortTagsByCount } from '@/lib/posts/tags';
import { PostList } from '@/components/posts/PostList';
import { TagIndexPanel, type TagIndexEntry } from '@/components/posts/TagIndexPanel';
import { ArchiveHeader } from '@/components/shared/ArchiveHeader';
import { PromptLine } from '@/components/terminal/PromptLine';

interface PageProps {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams() {
  // draft 전용 태그는 페이지 단에서 0건 → notFound()라 프리렌더 가치가 없다 (결정 D-4ⓐ)
  const posts = getPublishedPosts();
  const tags = [...new Set(posts.flatMap((p) => p.tags))];
  return tags.map((tag) => ({ tag }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `#${decoded} 태그`,
    description: `${decoded} 태그가 포함된 글 모음`,
  };
}

/** draft 제외 전체 글에서 태그 사용 빈도를 집계한다 (빈도 내림차순, 동률은 이름순) */
function buildTagIndex(): TagIndexEntry[] {
  return sortTagsByCount(countTags(getPublishedPosts())).map(
    ([name, count]) => ({ name, count }),
  );
}

/**
 * 태그별 목록 (핸드오버 8c — 설계 §7.4).
 * 브레드크럼 `grep -rl "#{Tag}" posts/` + 40px `#태그명` 헤더 +
 * ALL TAGS 인덱스 패널 + 필터된 목록(인덱스 01부터). 0건은 notFound() 유지.
 */
export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const posts = getPostsByTag(decoded);

  if (!posts || posts.length === 0) notFound();

  // 정렬은 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const publishedPosts = posts.filter((post) => !post.draft);

  if (publishedPosts.length === 0) notFound();

  const tagIndex = buildTagIndex();

  return (
    <>
      <PromptLine
        command={`grep -rl "#${decoded}" posts/`}
        className="mt-44 mb-26"
      />
      <ArchiveHeader
        title={`#${decoded}`}
        titleClassName="text-[40px] leading-[1.3]"
        description="이 태그가 달린 글"
        entryCount={publishedPosts.length}
        path={`tags/${decoded.toLowerCase()}/`}
      />
      <TagIndexPanel tags={tagIndex} current={decoded} />
      <PostList posts={publishedPosts} />
    </>
  );
}
