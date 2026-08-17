'use client';

import { useMemo, useState, useTransition } from 'react';
import type { PostMeta } from '@/types/common';
import {
  DEFAULT_POST_SORT,
  sortPostsByDate,
  type PostSortOrder,
} from '@/lib/posts/sort';
import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { DottedRule } from '@/components/terminal/DottedRule';
import { SortToggle } from '@/components/terminal/SortToggle';
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
  const [sortOrder, setSortOrder] = useState<PostSortOrder>(DEFAULT_POST_SORT);
  const [isPending, startTransition] = useTransition();

  // 정렬은 파생값 — props의 posts 순서에 의존하지 않는다 (정렬 정본: lib/posts/sort.ts).
  // 기본값이 서버 프리렌더 순서와 같아 초기 10건 HTML은 불변 (SEO 인수조건 유지)
  const sortedPosts = useMemo(
    () => sortPostsByDate(posts, sortOrder),
    [posts, sortOrder],
  );
  const newest = sortOrder === 'newest';

  const visiblePosts = sortedPosts.slice(0, visibleCount);
  const handleMore = () =>
    startTransition(() => setVisibleCount((count) => count + PAGE_SIZE));

  return (
    <section>
      <DottedRule
        left={`${posts.length} ENTRIES`}
        right={
          <SortToggle
            label={newest ? 'SORTED BY DATE ↓' : 'SORTED BY DATE ↑'}
            shortLabel={newest ? 'DATE ↓' : 'DATE ↑'}
            srHint={newest ? '누르면 오래된순으로 정렬' : '누르면 최신순으로 정렬'}
            onToggle={() =>
              // visibleCount는 유지 — 이미 로드한 진행 상태를 버리지 않는다 (설계 §3.4)
              setSortOrder((order) => (order === 'newest' ? 'oldest' : 'newest'))
            }
            className="max-md:text-[10px]"
          />
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
