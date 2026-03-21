import { getAllPosts } from '@/lib/mdx';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '카테고리',
  description: '카테고리별 글 목록',
};

export default function CategoriesPage() {
  const allPosts = getAllPosts().filter((post) => !post.draft);

  const categoryMap = new Map<string, number>();
  allPosts.forEach((post) => {
    categoryMap.set(post.category, (categoryMap.get(post.category) ?? 0) + 1);
  });

  const categories = Array.from(categoryMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div className="w-full px-10 md:px-20 lg:px-50">
      <h1 className="text-3xl font-bold mb-20">카테고리</h1>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-12">
        {categories.map(([name, count]) => (
          <Link
            key={name}
            href={`/categories/${name}`}
            className="block p-20 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 transition-colors"
          >
            <h2 className="text-xl font-semibold">{name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              {count}개의 글
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
