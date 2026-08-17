import type { Metadata } from 'next';
import { getPostsByCategory, getAllPosts } from '@/lib/mdx';
import { Default_Nav_items } from '@/constants/menu';
import { CATEGORY_CONTENT } from '@/constants/category-content';
import { CategoryTabs } from '@/components/posts/CategoryTabs';
import { PostList } from '@/components/posts/PostList';
import { DottedRule } from '@/components/terminal/DottedRule';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';
import { PromptLine } from '@/components/terminal/PromptLine';
import { TerminalButton } from '@/components/terminal/TerminalButton';

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  const postCategories = posts.map((p) => p.category);
  const navCategories = Default_Nav_items
    .filter((item) => item.path.startsWith('/categories/'))
    .map((item) => item.path.replace('/categories/', ''));
  const categories = [...new Set([...postCategories, ...navCategories])];
  return categories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const content = CATEGORY_CONTENT[category.toLowerCase()];
  return {
    title: `${content?.name ?? category} 카테고리`,
    description: content?.description ?? `${category} 관련 글 모음`,
  };
}

/**
 * 카테고리 페이지 (핸드오버 6b, 0건은 8a — 설계 §7.3).
 * 브레드크럼 `cd categories/{slug}` + 46px 대문자 타이틀 + 설명 +
 * 우측 `{n} ENTRIES`/경로 + 탭 + 필터된 목록(인덱스 01부터 재시작).
 */
export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const slug = category.toLowerCase();
  const content = CATEGORY_CONTENT[slug];

  // 정렬은 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const posts = getPostsByCategory(category).filter((post) => !post.draft);

  return (
    <>
      <PromptLine command={`cd categories/${slug}`} className="mt-44 mb-26" />
      <header className="mb-44 flex items-end justify-between gap-32">
        <div>
          <h1 className="font-display text-cat-title text-text-strong uppercase">
            {content?.name ?? category}
          </h1>
          {content?.description && (
            <p className="mt-12 text-[13px] leading-[2] text-text-muted">
              {content.description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] leading-[2] text-text-dim">
          <div>{posts.length} ENTRIES</div>
          <div className="text-text-faint">categories/{slug}/</div>
        </div>
      </header>
      <CategoryTabs active={slug} />
      {posts.length === 0 ? (
        <section>
          <DottedRule left="0 ENTRIES" className="mb-2" />
          <div className="border-y border-rule py-52 text-center">
            <p className="text-[13px] leading-[2.2] text-error">
              ls: categories/{slug}: 아직 글이 없습니다
            </p>
            <p className="mt-14 text-[12px] text-text-dim">
              이 카테고리는 준비 중입니다.
            </p>
            <TerminalButton href="/" className="mt-30">
              <span className="text-text-faint">$</span>
              <span>cd ~ — 전체 글 보기</span>
            </TerminalButton>
          </div>
        </section>
      ) : (
        <PostList posts={posts} />
      )}
      <FooterPrompt command="cd .." className="mt-56" />
    </>
  );
}
