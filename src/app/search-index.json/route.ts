import { getAllPostsWithContent } from '@/lib/mdx';

export function GET() {
  const posts = getAllPostsWithContent();

  const index = posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    tags: post.tags,
    category: post.category,
    date: post.date,
    content: post.content.slice(0, 2000),
  }));

  return Response.json(index);
}
