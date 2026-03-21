import { getAllPosts } from '@/lib/mdx';
import Card from '@/components/shared/Card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전체 글 목록',
  description: '모든 블로그 포스트를 확인하세요.',
};

export default function PostsPage() {
  const allPosts = getAllPosts()
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="w-full px-10 md:px-20 lg:px-50">
      <h1 className="text-3xl font-bold mb-20">전체 글</h1>
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {allPosts.map((post) => (
          <Card
            key={post.slug}
            slug={post.slug}
            category={post.category}
            title={post.title}
            description={post.description}
            date={post.date}
            keywords={post.keywords}
          />
        ))}
      </div>
    </div>
  );
}
