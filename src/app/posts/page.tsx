import { getPublishedPosts } from '@/lib/mdx';
import type { Metadata } from 'next';
import { PostList } from '@/components/posts/PostList';
import { PromptLine } from '@/components/terminal/PromptLine';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';

export const metadata: Metadata = {
  title: '전체 글 목록',
  description: '모든 블로그 포스트를 확인하세요.',
};

// 미디자인 인덱스 — 톤만 맞춤 (설계 §7.10). Card 그리드 → 홈과 동일 PostList 재사용
export default function PostsPage() {
  // 정렬은 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const allPosts = getPublishedPosts();

  return (
    <>
      <PromptLine command="ls posts/" className="mt-40 mb-26" />
      <h1 className="mb-44 font-display text-wordmark text-text-strong max-md:text-[19px]">
        전체 글
      </h1>
      <PostList posts={allPosts} />
      <FooterPrompt command="cd .." cursor className="mt-48" />
    </>
  );
}
