import { getAllPosts } from '@/lib/mdx';

export function GET() {
  const posts = getAllPosts().filter((post) => !post.draft);
  const map = Object.fromEntries(
    posts.map((post) => [post.slug, post.category.toLowerCase()]),
  );

  return Response.json(map);
}
