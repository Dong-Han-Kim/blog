import { getPublishedPosts } from '@/lib/mdx';
import type { Metadata } from 'next';
import { PostList } from '@/components/posts/PostList';
import { IndexPageShell } from '@/components/shared/IndexPageShell';

export const metadata: Metadata = {
  title: '전체 글 목록',
  description: '모든 블로그 포스트를 확인하세요.',
};

// 미디자인 인덱스 — 톤만 맞춤 (설계 §7.10). Card 그리드 → 홈과 동일 PostList 재사용
export default function PostsPage() {
  // 정렬은 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const allPosts = getPublishedPosts();

  return (
    <IndexPageShell command="ls posts/" title="전체 글">
      <PostList posts={allPosts} />
    </IndexPageShell>
  );
}
