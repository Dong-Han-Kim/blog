'use client';

import { useState, useTransition } from 'react';
import type { PostMeta } from '@/types/common';
import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { DottedRule } from '@/components/terminal/DottedRule';
import { TerminalButton } from '@/components/terminal/TerminalButton';
import { PostRow } from './PostRow';

/** "더 보기" 초기 표시·증분 개수 (핸드오버 8b) */
const PAGE_SIZE = 10;

interface PostListProps {
  posts: PostMeta[];
  showFilename?: boolean;
}

/**
 * 목록 헤더 줄 + 포스트 행들 + 닫는 룰 + "더 보기" (설계 §7.1–7.2).
 * 홈·카테고리·태그 페이지 공용. visibleCount 상태(초기 10, +10)는 클라이언트,
 * 초기 10건은 SSR 렌더로 HTML에 포함된다 (SEO 인수조건).
 */
export function PostList({ posts, showFilename = true }: PostListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isPending, startTransition] = useTransition();

  const visiblePosts = posts.slice(0, visibleCount);
  const handleMore = () =>
    startTransition(() => setVisibleCount((count) => count + PAGE_SIZE));

  return (
    <section>
      <DottedRule
        left={`${posts.length} ENTRIES`}
        right={
          <>
            <span className="max-md:hidden">SORTED BY DATE ↓</span>
            <span className="hidden max-md:inline">DATE ↓</span>
          </>
        }
        className="mb-2 max-md:gap-10 max-md:text-[10px]"
      />
      <div className="flex flex-col">
        {visiblePosts.map((post, i) => (
          <PostRow
            key={post.slug}
            post={post}
            index={i + 1}
            showFilename={showFilename}
          />
        ))}
        {/* 마지막 행 아래 닫는 1px rule (핸드오버 2a) */}
        <div aria-hidden className="border-t border-rule" />
      </div>
      <LoadMore
        visible={visibleCount}
        total={posts.length}
        loading={isPending}
        onMore={handleMore}
      />
    </section>
  );
}

interface LoadMoreProps {
  visible: number;
  total: number;
  loading: boolean;
  onMore: () => void;
}

/**
 * "더 보기" 블록 (핸드오버 8b): `$ ls --more — 다음 10개` 버튼 +
 * `{표시}/{전체} 표시 중` + 240×4px 진행 바. 전체 ≤10건이면 미렌더,
 * 전부 로드되면 버튼을 `— 마지막입니다` 비활성 텍스트로 교체.
 */
function LoadMore({ visible, total, loading, onMore }: LoadMoreProps) {
  if (total <= PAGE_SIZE) return null;

  const shown = Math.min(visible, total);
  const done = shown >= total;

  return (
    <div className="mt-40 flex flex-col items-center gap-14">
      {done ? (
        <p className="text-[13px] text-text-dim">— 마지막입니다</p>
      ) : (
        <TerminalButton
          onClick={onMore}
          className="gap-10 px-24 py-12 text-[13px]"
          aria-label="다음 10개 글 더 보기"
        >
          <span className="text-text-faint">$</span>
          {loading ? (
            <>
              <span>ls --more ...</span>
              <BlinkCursor />
            </>
          ) : (
            <>
              <span>ls --more</span>
              <span className="text-text-dim">— 다음 10개</span>
            </>
          )}
        </TerminalButton>
      )}
      <p className="text-[11px] text-text-dim">
        {shown} / {total} 표시 중
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={shown}
        aria-label="목록 표시 진행률"
        className="h-4 w-240 bg-track"
      >
        <div
          className="h-full bg-text-faint"
          style={{ width: `${(shown / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
