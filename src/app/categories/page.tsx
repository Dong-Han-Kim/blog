import { getPublishedPosts } from '@/lib/mdx';
import { countCategories } from '@/lib/posts/tags';
import { compareStrings } from '@/lib/posts/sort';
import Link from 'next/link';
import type { Metadata } from 'next';
import { IndexPageShell } from '@/components/shared/IndexPageShell';

export const metadata: Metadata = {
  title: '카테고리',
  description: '카테고리별 글 목록',
};

// 미디자인 인덱스 — 구조(집계·그리드) 불변, CRT 토큰으로 톤만 맞춤 (설계 §7.10)
export default function CategoriesPage() {
  const allPosts = getPublishedPosts();

  const categories = Array.from(countCategories(allPosts).entries()).sort(
    (a, b) => compareStrings(a[0], b[0]),
  );

  return (
    <IndexPageShell command="ls categories/" title="카테고리">
      <div className="grid grid-cols-3 gap-12 max-md:grid-cols-1 md:max-lg:grid-cols-2">
        {categories.map(([name, count]) => (
          <Link
            key={name}
            href={`/categories/${name}`}
            className="block border border-rule p-20 hover:border-accent hover:bg-bg-hover"
          >
            <h2 className="text-[16px] text-text-strong">{name}</h2>
            <p className="mt-6 text-[12px] text-text-dim">{count} entries</p>
          </Link>
        ))}
      </div>
    </IndexPageShell>
  );
}
