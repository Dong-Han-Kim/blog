import { getPublishedPosts } from '@/lib/mdx';

export function GET() {
  const posts = getPublishedPosts();
  const map = Object.fromEntries(
    posts.map((post) => [post.slug, post.category.toLowerCase()]),
  );

  return Response.json(map);
}
