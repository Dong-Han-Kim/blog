import type { MetadataRoute } from 'next';
import { getPublishedPosts } from '@/lib/mdx';
import { tagHref } from '@/lib/routes';
import { SITE_URL } from '@/constants/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getPublishedPosts();

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const categories = [...new Set(posts.map((post) => post.category))];
  const categoryEntries: MetadataRoute.Sitemap = categories.map(
    (category) => ({
      url: `${SITE_URL}/categories/${category}`,
      changeFrequency: 'weekly',
      priority: 0.5,
    }),
  );

  const tags = [...new Set(posts.flatMap((post) => post.tags))];
  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${SITE_URL}${tagHref(tag)}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }));

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
    ...postEntries,
    ...categoryEntries,
    ...tagEntries,
  ];
}
