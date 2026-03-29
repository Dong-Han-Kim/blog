'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

let slugMapCache: Record<string, string> | null = null;

export function usePostCategory(): string | null {
  const pathname = usePathname();
  const [category, setCategory] = useState<string | null>(null);

  const slug = pathname.startsWith('/posts/') ? pathname.split('/')[2] : null;

  useEffect(() => {
    if (!slug) {
      setCategory(null);
      return;
    }

    if (slugMapCache) {
      setCategory(slugMapCache[slug] ?? null);
      return;
    }

    fetch('/api/slug-map')
      .then((res) => res.json())
      .then((map: Record<string, string>) => {
        slugMapCache = map;
        setCategory(map[slug] ?? null);
      })
      .catch(() => {});
  }, [slug]);

  return category;
}
