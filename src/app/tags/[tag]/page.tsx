import { notFound } from 'next/navigation';
import { getAllPosts, getPostsByTag } from '@/lib/mdx';
import Card from '@/components/shared/Card';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
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

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const posts = getPostsByTag(decoded);

  if (!posts || posts.length === 0) notFound();

  const sortedPosts = posts
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="w-full px-16 md:px-24 lg:px-48">
      <h1 className="text-3xl font-bold mb-20">#{decoded}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-24">
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
