import { getAllPosts } from '@/lib/mdx';
import { CATEGORY_CONTENT } from '@/constants/category-content';
import { CategoryTabs } from '@/components/posts/CategoryTabs';
import { PostList } from '@/components/posts/PostList';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';

/**
 * 홈 — 포스트 목록 (핸드오버 2a/7a, 설계 §7.1).
 * 히어로 2줄 + 통계, 카테고리 탭, 목록(더 보기 포함), 푸터 `exit`.
 */
export default function Home() {
  // 정렬은 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const posts = getAllPosts().filter((post) => !post.draft);

  const categoryCount = Object.keys(CATEGORY_CONTENT).length;
  const year = new Date().getFullYear();

  return (
    <>
      <section className="mt-64 mb-66 max-w-800 max-md:mt-32 max-md:mb-28">
        <h1 className="font-display text-hero text-text-strong max-md:text-[19px] max-md:leading-[1.85]">
          프론트엔드부터 <br className="md:hidden" />
          인프라까지,
          <br />
          배운 것을 기록합니다.
        </h1>
        <p className="mt-24 text-[13px] leading-[2] text-text-hint max-md:mt-14 max-md:text-[11px]">
          {posts.length} posts · {categoryCount} categories · {year}
        </p>
      </section>
      <CategoryTabs active="ALL" />
      <PostList posts={posts} />
      <FooterPrompt command="exit" className="mt-60" />
    </>
  );
}
