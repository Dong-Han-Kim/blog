import { getAllPosts } from '@/lib/mdx';

export function GET() {
  const posts = getAllPosts().filter((post) => !post.draft);

  const index = posts.map((post) => ({
    slug: post.slug,
    title: post.title,
    description: post.description,
    tags: post.tags,
    category: post.category,
    date: post.date,
  }));

  return Response.json(index);
}
