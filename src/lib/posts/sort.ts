import type { PostMeta } from '@/types/common';

export type PostSortOrder = 'newest' | 'oldest';

/** 기본 정렬 순서 — 서버 프리렌더와 클라이언트 초기 상태가 공유하는 단일 정본 */
export const DEFAULT_POST_SORT: PostSortOrder = 'newest';

/**
 * 날짜 기준 포스트 정렬 정본 (설계 §3.3). 원본 불변(복사 정렬).
 * mdx.ts는 fs를 임포트하는 서버 전용 파일이라 클라이언트(PostList)가 쓸 수 있도록
 * 여기 분리 — 목록 정렬은 이 함수 한 곳만 신뢰한다.
 * date는 YYYY-MM-DD 고정 형식이라 문자열 비교가 시간순과 일치한다 (mdx.ts §3.1과 동일 근거).
 * 동일 날짜 tie-break는 키 함수 기반 사전식 비교로 total order(추이성)를 구조적으로 보장한다:
 * ① groupKey 오름차순(방향 무관) — 시리즈 소속(series 존재 && seriesOrder 존재)이면
 *    series.trim(), 아니면 slug. 같은 날짜의 시리즈 연작이 목록에서 인접하게 묶인다.
 * ② groupKey가 같으면 시리즈 소속 여부(비소속 우선) → 둘 다 소속이면 같은 시리즈이므로
 *    seriesOrder × direction (newest면 큰 order가 먼저 — 시리즈 후속편이 더 최신).
 * ③ 마지막으로 slug 오름차순(방향 무관) — sortSeriesPosts와 같은 결정성 원칙
 *    (파일시스템 순서 의존 제거).
 * 문자열 비교는 로케일 무관 코드 유닛 비교(compareStrings) — 한글 시리즈명↔Latin slug의
 * 교차 스크립트 비교가 실행 환경 기본 로케일(en: Latin<Hangul, ko: Hangul<Latin)에
 * 좌우되면 서버 프리렌더와 클라이언트(PostList)의 정렬이 어긋나 hydration 순서
 * 불일치가 생기므로 localeCompare를 쓰지 않는다.
 * 모든 쌍 비교가 sameDateSortKey 한 곳에서 파생되므로 쌍 단위 분기로 생기던 순환이 없다.
 * 시리즈인데 seriesOrder가 없는 글은 비소속으로 취급(groupKey=slug)해 한쪽만 order가
 * 있는 케이스가 순환을 만들지 않는다.
 */
type SameDateSortKey = {
  /** 동일 날짜 그룹핑 키 — 시리즈 소속이면 시리즈명, 아니면 slug */
  groupKey: string;
  inSeries: boolean;
  seriesOrder: number;
};

/**
 * 로케일 무관 문자열 비교 — UTF-16 코드 유닛 오름차순.
 * localeCompare는 ICU/기본 로케일에 콜레이션이 좌우돼(en↔ko에서 Latin·Hangul 순서 반전)
 * 빌드 서버·브라우저·테스트 환경 간 결과가 달라질 수 있으므로 쓰지 않는다.
 * 태그 정렬(lib/posts/tags.ts의 sortTagsByCount)과 카테고리 이름순 정렬도 이 함수를
 * 쓴다 — topTags가 서버 프리렌더와 클라이언트 팔레트 양쪽에서 호출돼 위와 동일한
 * hydration 순서 불일치 구조를 갖기 때문이다 (결정 D-3ⓒ, 2026-08-29).
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sameDateSortKey(post: PostMeta): SameDateSortKey {
  const series = post.series?.trim();
  if (series && post.seriesOrder !== undefined) {
    return { groupKey: series, inSeries: true, seriesOrder: post.seriesOrder };
  }
  return { groupKey: post.slug, inSeries: false, seriesOrder: 0 };
}

export function sortPostsByDate(
  posts: PostMeta[],
  order: PostSortOrder = DEFAULT_POST_SORT,
): PostMeta[] {
  const direction = order === 'oldest' ? 1 : -1;
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) return (a.date < b.date ? -1 : 1) * direction;
    const keyA = sameDateSortKey(a);
    const keyB = sameDateSortKey(b);
    const byGroup = compareStrings(keyA.groupKey, keyB.groupKey);
    if (byGroup !== 0) return byGroup;
    if (keyA.inSeries !== keyB.inSeries) return keyA.inSeries ? 1 : -1;
    if (keyA.inSeries && keyA.seriesOrder !== keyB.seriesOrder) {
      return (keyA.seriesOrder - keyB.seriesOrder) * direction;
    }
    return compareStrings(a.slug, b.slug);
  });
}
