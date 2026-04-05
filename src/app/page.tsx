import { getAllPosts } from '@/lib/mdx';
import { PostMeta } from '../types/common';

import Card from '@/components/shared/Card';

export default function Home() {
  const allPosts: PostMeta[] = getAllPosts();

  const sortedPosts = allPosts.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    const firstDate = new Date(a.date).getTime();
    const secondDate = new Date(b.date).getTime();
    return secondDate - firstDate;
  });

  return (
    <div className="w-full px-16 md:px-24 lg:px-48">
      <section className="mb-48 pt-16">
        <h1 className="font-mono text-4xl md:text-5xl font-bold tracking-tight mb-12">
          b.log()
        </h1>
        <p className="text-lg text-muted-foreground max-w-[480px]">
          웹 개발의 경험과 학습을 기록합니다.
        </p>
      </section>
      <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-24">
        {sortedPosts.map((post, index) => {
          if (post.draft) return null;
          return (
            <Card
              key={post.slug}
              slug={post.slug}
              category={post.category}
              title={post.title}
              description={post.description}
              date={post.date}
              keywords={post.keywords}
              featured={index === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
