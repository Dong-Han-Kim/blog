import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/mdx';
import { tagHref } from '@/lib/routes';

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://blog92.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts().filter((post) => !post.draft);

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const categories = [...new Set(posts.map((post) => post.category))];
  const categoryEntries: MetadataRoute.Sitemap = categories.map(
    (category) => ({
      url: `${BASE_URL}/categories/${category}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    }),
  );

  const tags = [...new Set(posts.flatMap((post) => post.tags))];
  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${BASE_URL}${tagHref(tag)}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...postEntries,
    ...categoryEntries,
    ...tagEntries,
  ];
}
