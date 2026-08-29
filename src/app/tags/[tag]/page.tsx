import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getPostsByTag, getPublishedPosts } from '@/lib/mdx';
import { PostList } from '@/components/posts/PostList';
import { TagIndexPanel, type TagIndexEntry } from '@/components/posts/TagIndexPanel';
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
  const counts = new Map<string, number>();
  getAllPosts()
    .filter((post) => !post.draft)
    .forEach((post) => {
      post.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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
      <header className="mb-40 flex items-end justify-between gap-32">
        <div>
          <h1 className="font-display text-[40px] leading-[1.3] text-text-strong">
            #{decoded}
          </h1>
          <p className="mt-12 text-[12px] leading-[2] text-text-muted">
            이 태그가 달린 글
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-[2] text-text-dim">
          <div>{publishedPosts.length} ENTRIES</div>
          <div className="text-text-faint">tags/{decoded.toLowerCase()}/</div>
        </div>
      </header>
      <TagIndexPanel tags={tagIndex} current={decoded} />
      <PostList posts={publishedPosts} />
    </>
  );
}
