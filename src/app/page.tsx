import { getAllPosts } from '@/lib/posts';
import { AllPost } from '../types/post';
import Link from 'next/link';

export default function Home() {
  const allPosts: AllPost[] = getAllPosts();
  const sortedPosts = allPosts.sort((a, b) => {
    if (!a.date || !b.date) return 0;
    const firstDate = new Date(a.date).getTime();
    const secondDate = new Date(b.date).getTime();
    return secondDate - firstDate;
  });

  return (
    <>
      <div className="w-full">
        <h1 className="text-5xl mb-10">The Latest.{allPosts.length}</h1>
        <div>
          {sortedPosts.map((post) => {
            return (
              <article key={post.slug} className="p-12 mb-8">
                <Link href={`/blog/${post.category}/${post.slug}`}>
                  <h3 className="text-2xl font-extrabold">{post.title}</h3>
                  <p>{post.description}</p>
                  <p className="text-gray-300 text-sm">{post.date}</p>
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
