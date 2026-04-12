import Link from 'next/link';
import { getPostsByCategory, getAllPosts } from '@/lib/mdx';
import { Default_Nav_items } from '@/constants/menu';
import Card from '@/components/shared/Card';
import type { Metadata } from 'next';

const categoryLineColor: Record<string, string> = {
  frontend: 'border-blue-500 dark:border-blue-400',
  backend: 'border-emerald-500 dark:border-emerald-400',
  devops: 'border-amber-500 dark:border-amber-400',
  database: 'border-violet-500 dark:border-violet-400',
  projects: 'border-cyan-500 dark:border-cyan-400',
  til: 'border-rose-400 dark:border-rose-400',
  nextjs: 'border-slate-500 dark:border-slate-400',
};

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
  return {
    title: `${category} 카테고리`,
    description: `${category} 관련 글 모음`,
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;

  const posts = getPostsByCategory(category);

  const sortedPosts = posts
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sortedPosts.length === 0) {
    const accentColor = categoryLineColor[category.toLowerCase()] ?? 'border-gray-900 dark:border-gray-200';
    return (
      <div className="w-full px-10 md:px-20 lg:px-50">
        <h1 className="text-3xl font-bold mb-20">{category}</h1>
        <div className={`border-l-2 ${accentColor} pl-16 py-40 flex flex-col gap-8`}>
          <span className="font-mono text-muted-foreground">// coming soon</span>
          <p className="text-sm text-muted-foreground">아직 작성된 글이 없습니다.</p>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors mt-8"
          >
            다른 글 둘러보기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-10 md:px-20 lg:px-50">
      <h1 className="text-3xl font-bold mb-20">{category}</h1>
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
        {sortedPosts.map((post) => (
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
