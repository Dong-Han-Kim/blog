import { getAllPosts } from '@/lib/mdx';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '태그',
  description: '태그별 글 목록',
};

export default function TagsPage() {
  const allPosts = getAllPosts().filter((post) => !post.draft);

  const tagMap = new Map<string, number>();
  allPosts.forEach((post) => {
    post.tags.forEach((tag) => {
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    });
  });

  const tags = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="w-full px-10 md:px-20 lg:px-50">
      <h1 className="text-3xl font-bold mb-20">태그</h1>
      <div className="flex flex-wrap gap-8">
        {tags.map(([name, count]) => (
          <Link
            key={name}
            href={`/tags/${name}`}
            className="px-12 py-6 bg-gray-100 dark:bg-gray-800 rounded-full text-sm hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          >
            #{name} ({count})
          </Link>
        ))}
      </div>
    </div>
  );
}
