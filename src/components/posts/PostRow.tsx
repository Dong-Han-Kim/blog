import Link from 'next/link';
import type { PostMeta } from '@/types/common';

interface PostRowProps {
  post: PostMeta;
  /** 필터된 목록 내 1-base 순번 — padStart(2,'0')는 내부 처리 (설계 §7.1) */
  index: number;
  /** 메타 3열의 파일명 표시 여부. 768–899px 구간에서는 CSS로 항상 숨김 */
  showFilename?: boolean;
}

/**
 * 포스트 목록 행 1건 (핸드오버 2a/7a).
 * - 데스크톱: 88px(거터)/1fr(본문)/178px(메타) 그리드, 768–899px는 메타 140px + 파일명 숨김
 * - 모바일(≤767): 그리드 해체 — 인덱스·날짜·카테고리 한 줄이 제목 위, 태그·파일명 숨김
 * - 행 전체 링크: absolute 오버레이 + 태그 칩만 z-10 (설계 D8 — <a> 중첩 회피)
 * - 호버: 좌측 3px accent 바 + bg-hover 무전환 즉시 적용 (터치는 :active)
 */
export function PostRow({ post, index, showFilename = true }: PostRowProps) {
  const idx = String(index).padStart(2, '0');
  const category = post.category.toLowerCase();
  const tags = post.tags.slice(0, 5);

  return (
    <article className="relative grid grid-cols-[88px_1fr_178px] items-start gap-32 border-t border-rule border-l-[3px] border-l-transparent py-30 pr-20 pl-16 hover:border-l-accent hover:bg-bg-hover active:border-l-accent active:bg-bg-hover md:max-lg:grid-cols-[88px_1fr_140px] max-md:block max-md:py-20 max-md:pr-0 max-md:pl-14">
      {/* 행 전체 클릭 타깃 — 시각 콘텐츠는 아래 in-flow 요소가 담당 */}
      <Link
        href={`/posts/${post.slug}`}
        aria-label={post.title}
        className="absolute inset-0"
      />

      {/* 모바일 전용: 인덱스 · 날짜 · [카테고리] 한 줄 (핸드오버 7a) */}
      <p className="mb-10 hidden items-center gap-12 text-[10px] text-text-dim max-md:flex">
        <span className="font-display text-[16px] leading-none text-text-faint">
          {idx}
        </span>
        <span className="text-text-muted">{post.date}</span>
        <span>[{category}]</span>
      </p>

      {/* 1열 거터: 2자리 인덱스 + 4px 바 (데스크톱 전용) */}
      <div className="max-md:hidden">
        <div className="font-display text-index text-text-faint">{idx}</div>
        <div aria-hidden className="mt-10 h-4 bg-text-faint" />
      </div>

      {/* 2열 본문: 제목 / 요약 / 태그(최대 5) */}
      <div>
        <h2 className="font-display text-list-title text-text-strong max-md:text-[16px] max-md:leading-[1.65]">
          {post.title}
        </h2>
        {post.description && (
          <p className="mt-12 max-w-620 text-sub text-text-muted max-md:mt-10 max-md:text-[12px]">
            {post.description}
          </p>
        )}
        {tags.length > 0 && (
          <ul className="mt-16 flex flex-wrap gap-12 text-[11px] leading-none text-text-dim max-md:hidden">
            {tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/tags/${encodeURIComponent(tag)}`}
                  className="relative z-10 hover:text-text-strong"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3열 메타: 날짜 / [카테고리] / 파일명 (데스크톱 전용) */}
      <div className="text-right text-[11px] leading-[2.1] text-text-dim max-md:hidden">
        <div className="text-text-muted">{post.date}</div>
        <div>[{category}]</div>
        {showFilename && (
          <div className="mt-10 leading-[1.7] break-all text-text-faint md:max-lg:hidden">
            {post.slug}.md
          </div>
        )}
      </div>
    </article>
  );
}
