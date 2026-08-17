import type { PostMeta } from '@/types/common';

export type PostSortOrder = 'newest' | 'oldest';

/** 기본 정렬 순서 — 서버 프리렌더와 클라이언트 초기 상태가 공유하는 단일 정본 */
export const DEFAULT_POST_SORT: PostSortOrder = 'newest';

/**
 * 날짜 기준 포스트 정렬 정본 (설계 §3.3). 원본 불변(복사 정렬).
 * mdx.ts는 fs를 임포트하는 서버 전용 파일이라 클라이언트(PostList)가 쓸 수 있도록
 * 여기 분리 — 목록 정렬은 이 함수 한 곳만 신뢰한다.
 * date는 YYYY-MM-DD 고정 형식이라 문자열 비교가 시간순과 일치한다 (mdx.ts §3.1과 동일 근거).
 * 동일 날짜 tie-break: slug.localeCompare — sortSeriesPosts와 같은 결정성 원칙
 * (순서와 무관하게 항상 오름차순, 파일시스템 순서 의존 제거).
 */
export function sortPostsByDate(
  posts: PostMeta[],
  order: PostSortOrder = DEFAULT_POST_SORT,
): PostMeta[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * direction;
    return a.slug.localeCompare(b.slug);
  });
}
