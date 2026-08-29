import Link from 'next/link';
import { getPublishedPosts } from '@/lib/mdx';
import { sortPostsByDate } from '@/lib/posts/sort';
import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { DottedRule } from '@/components/terminal/DottedRule';
import { PROMPT } from '@/components/terminal/PromptLine';
import { NotFoundPath } from '@/components/shared/NotFoundPath';

/**
 * 404 (설계 §7.8, 핸드오버 6c/7d).
 * DID YOU MEAN 제안은 합의된 대체안(최신 글 2건 + categories/) — 유사도 산출은
 * 경로가 클라이언트에서만 확정되어 서버 렌더와 상충 (설계 D9).
 */
export default function NotFound() {
  const recentPosts = sortPostsByDate(getPublishedPosts()).slice(0, 2);

  const suggestions = [
    ...recentPosts.map((post) => ({
      href: `/posts/${post.slug}`,
      label: `posts/${post.slug}.md`,
    })),
    { href: '/categories', label: 'categories/' },
  ];

  return (
    <div className="mt-76">
      <h1 className="font-display text-glyph-404 tracking-[6px] text-text-strong max-md:text-[60px] max-md:tracking-[4px]">
        404
      </h1>

      {/* 에러 블록 — 모바일은 프롬프트/명령/에러 3줄 분리 */}
      <div className="mt-34 text-[13px] leading-[2.2]">
        <p>
          <span className="text-text-faint max-md:block">{PROMPT}</span>{' '}
          <span className="text-text-body max-md:block">
            cat posts/
            <NotFoundPath />
          </span>
        </p>
        <p className="text-error">
          cat: posts/
          <NotFoundPath />: No such file or directory
        </p>
      </div>

      <div className="mt-56">
        <DottedRule
          left={
            <span className="tracking-[2px] text-text-faint">DID YOU MEAN</span>
          }
        />
        <ul className="mt-20 flex flex-col gap-16">
          {suggestions.map((suggestion) => (
            <li key={suggestion.href}>
              <Link
                href={suggestion.href}
                className="grid grid-cols-[26px_1fr] gap-12 text-[13px] leading-[1.8] text-text-muted hover:opacity-75"
              >
                <span aria-hidden className="text-text-faint">
                  ↳
                </span>
                <span>{suggestion.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-66 text-[13px]">
        <span className="text-text-faint">{PROMPT}</span>{' '}
        <Link href="/" className="text-text-muted hover:text-text-strong">
          cd ~
        </Link>
        <BlinkCursor className="ml-8" />
      </p>
    </div>
  );
}
