import Link from 'next/link';

import { CategoryBadge } from '@/components/terminal/CategoryBadge';
import { cn } from '@/lib/utils';
import type { SeriesInfo } from '@/lib/mdx';

interface SeriesNavProps {
  /** getSeriesForPost() 결과 (null 아님을 호출부가 보장) */
  series: SeriesInfo;
  className?: string;
}

/**
 * 시리즈(연재) 박스 (feat-post-series 설계 §4) — 클라이언트 JS 없는 서버 컴포넌트.
 * TOC 접힘 바 + CategoryBadge 역상 배지 관례를 조합한 "터미널 파일 목록" 메타포.
 * - 현재 편: ▸ + accent 하이라이트, 링크 아님 (aria-current)
 * - 현재 글이 draft(currentIndex === -1)면 하이라이트·PREV/NEXT 없이 목록만,
 *   카운터는 `(N편)` 표기 (설계 §6.5)
 * - [SERIES] 배지는 CategoryBadge 프리미티브 재사용 (역상 대비 근거는 거기 주석 참조)
 */
export function SeriesNav({ series, className }: SeriesNavProps) {
  const { name, posts, currentIndex, prev, next } = series;
  const counter =
    currentIndex === -1
      ? `(${posts.length}편)`
      : `(${currentIndex + 1}/${posts.length})`;

  return (
    <nav
      aria-label={`시리즈: ${name}`}
      className={cn('border border-rule bg-bg-raised', className)}
    >
      {/* 헤더 행: [SERIES] 배지 + 시리즈명 + 편수 카운터 */}
      <div className="flex items-center justify-between gap-12 border-b border-rule-inner p-[12px_14px]">
        <div className="flex min-w-0 items-center gap-12">
          <CategoryBadge category="SERIES" className="shrink-0" />
          <span className="truncate text-[13px] text-text-body">{name}</span>
        </div>
        <span className="shrink-0 text-meta text-text-faint">{counter}</span>
      </div>

      {/* 편 목록 — 표시 번호는 정렬 후 인덱스+1 (order 중복/구멍과 무관하게 1..N) */}
      <ol className="flex flex-col gap-10 p-[14px_16px]">
        {posts.map((post, i) => (
          <li key={post.slug} className="flex items-baseline gap-10">
            <span className="shrink-0 text-meta text-text-faint" aria-hidden>
              {String(i + 1).padStart(2, '0')}
            </span>
            {i === currentIndex ? (
              <span
                aria-current="true"
                className="text-[13px] leading-[1.8] text-accent"
              >
                <span aria-hidden>▸ </span>
                {post.title}
              </span>
            ) : (
              <Link
                href={`/posts/${post.slug}`}
                className="text-[13px] leading-[1.8] text-text-dim hover:text-text-strong"
              >
                {post.title}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {/* 시리즈 내 이전/다음 — 한쪽이라도 있을 때만, 모바일 세로 스택 */}
      {(prev || next) && (
        <div className="flex justify-between gap-20 border-t border-rule-inner p-[12px_14px] text-meta max-md:flex-col max-md:gap-10">
          {prev && (
            <Link
              href={`/posts/${prev.slug}`}
              className="flex min-w-0 items-baseline gap-8 hover:opacity-75"
            >
              <span className="shrink-0 text-text-faint">← PREV</span>
              <span className="truncate text-text-muted">{prev.title}</span>
            </Link>
          )}
          {next && (
            <Link
              href={`/posts/${next.slug}`}
              className="ml-auto flex min-w-0 items-baseline gap-8 hover:opacity-75 max-md:ml-0"
            >
              <span className="truncate text-text-muted">{next.title}</span>
              <span className="shrink-0 text-text-faint">NEXT →</span>
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
