import { getPublishedPosts } from '@/lib/mdx';
import { countTags } from '@/lib/posts/tags';
import { tagHref } from '@/lib/routes';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PromptLine } from '@/components/terminal/PromptLine';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';

export const metadata: Metadata = {
  title: '태그',
  description: '태그별 글 목록',
};

// 미디자인 인덱스 — 구조(집계·칩 목록) 불변, CRT 토큰으로 톤만 맞춤 (설계 §7.10)
export default function TagsPage() {
  const allPosts = getPublishedPosts();

  const tagMap = countTags(allPosts);
  const tags = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PromptLine command="ls tags/" className="mt-40 mb-26" />
      <h1 className="mb-44 font-display text-wordmark text-text-strong max-md:text-[19px]">
        태그
      </h1>
      <div className="flex flex-wrap gap-8">
        {tags.map(([name, count]) => (
          <Link
            key={name}
            href={tagHref(name)}
            className="border border-text-faint px-10 py-5 text-[11px] text-text-muted hover:border-accent hover:text-text-strong"
          >
            #{name} <span className="text-text-faint">{count}</span>
          </Link>
        ))}
      </div>
      <FooterPrompt command="cd .." cursor className="mt-48" />
    </>
  );
}
