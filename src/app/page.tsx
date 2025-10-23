import { getAllPosts } from '@/lib/posts';
import { PostMeta } from '../types/common';

import Card from '@/components/shared/Card';

export default function Home() {
  const allPosts: PostMeta[] = getAllPosts();
  console.log(allPosts);

  const sortedPosts = allPosts.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    const firstDate = new Date(a.date).getTime();
    const secondDate = new Date(b.date).getTime();
    return secondDate - firstDate;
  });

  return (
    <>
      <div className="w-full bg-amber-300">
        <h1 className="text-5xl mb-10">ALL</h1>
        <div>
          {sortedPosts.map((post) => {
            if (post.draft) return null;
            return (
              <Card
                key={post.slug}
                slug={post.slug}
                category={post.category}
                title={post.title}
                description={post.description}
                date={post.date}
                thumbnail={post.thumbnail}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
