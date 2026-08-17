import type { CommentWithChildren } from '@/types/comment';

export type CommentSortOrder = 'oldest' | 'newest';

/** 기본 정렬 순서 — DB 쿼리 asc(createdAt) 및 SSR 초기 렌더와 동일 (설계 §2.2) */
export const DEFAULT_COMMENT_SORT: CommentSortOrder = 'oldest';

/**
 * 루트 댓글만 정렬해 새 배열 반환 — children은 건드리지 않는다 (설계 §3.2).
 * 답글 스레드는 대화문이라 항상 createdAt asc 유지: 저장 상태(commentTree)의
 * asc append 불변식을 그대로 쓰므로 삽입/Realtime 경로 수정이 불필요하다.
 * createdAt 비교는 Date.parse 기반: 서버 직렬화(toISOString, `Z`)와 Realtime
 * 페이로드(Postgres 타임스탬프, `+00:00` 오프셋)의 포맷이 섞여 문자열 비교는
 * 안전하지 않다. 동시각 tie-break는 id 비교로 결정성 확보.
 */
export function sortRootComments(
  roots: CommentWithChildren[],
  order: CommentSortOrder,
): CommentWithChildren[] {
  const direction = order === 'newest' ? -1 : 1;
  return [...roots].sort((a, b) => {
    const timeA = Date.parse(a.createdAt);
    const timeB = Date.parse(b.createdAt);
    if (timeA !== timeB) return (timeA - timeB) * direction;
    return a.id.localeCompare(b.id);
  });
}
