import { getPublishedPosts } from '@/lib/mdx';
import { countTags, sortTagsByCount } from '@/lib/posts/tags';
import { tagHref } from '@/lib/routes';
import type { Metadata } from 'next';
import { IndexPageShell } from '@/components/shared/IndexPageShell';
import { TerminalChip } from '@/components/terminal/TerminalChip';

export const metadata: Metadata = {
  title: '태그',
  description: '태그별 글 목록',
};

// 미디자인 인덱스 — 구조(집계·칩 목록) 불변, CRT 토큰으로 톤만 맞춤 (설계 §7.10)
export default function TagsPage() {
  const allPosts = getPublishedPosts();

  const tags = sortTagsByCount(countTags(allPosts));

  return (
    <IndexPageShell command="ls tags/" title="태그">
      <div className="flex flex-wrap gap-8">
        {tags.map(([name, count]) => (
          <TerminalChip key={name} href={tagHref(name)}>
            #{name} <span className="text-text-faint">{count}</span>
          </TerminalChip>
        ))}
      </div>
    </IndexPageShell>
  );
}
