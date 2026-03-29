'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface SearchPost {
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  category: string;
  date: string;
  content: string;
}

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (open && posts.length === 0) {
      fetch('/search-index.json')
        .then((res) => res.json())
        .then(setPosts);
    }
  }, [open, posts.length]);

  const fuse = useMemo(
    () =>
      new Fuse(posts, {
        keys: [
          { name: 'title', weight: 0.4 },
          { name: 'description', weight: 0.25 },
          { name: 'content', weight: 0.2 },
          { name: 'tags', weight: 0.15 },
        ],
        threshold: 0.3,
        includeMatches: true,
      }),
    [posts],
  );

  const results = useMemo(() => {
    if (!query) return posts.slice(0, 10);
    return fuse.search(query, { limit: 10 }).map((r) => r.item);
  }, [query, fuse, posts]);

  const handleSelect = useCallback(
    (slug: string) => {
      setOpen(false);
      setQuery('');
      router.push(`/posts/${slug}`);
    },
    [router],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="글 검색..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
        <CommandGroup heading="포스트">
          {results.map((post) => (
            <CommandItem
              key={post.slug}
              value={post.slug}
              onSelect={() => handleSelect(post.slug)}
            >
              <div className="flex flex-col gap-2">
                <span className="font-medium">{post.title}</span>
                <span className="text-xs text-muted-foreground">
                  {post.category} · {post.tags.map((t) => `#${t}`).join(' ')}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
