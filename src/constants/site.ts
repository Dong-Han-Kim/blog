/**
 * 블로그 소유자 표시 이름 — 댓글 AUTHOR 배지 판별용 (설계 §7.6, D12).
 * 댓글 스키마에 author 플래그가 없어 authorName 문자열 일치로 판별한다.
 * 표현 전용이며, 동일 이름으로 작성하면 스푸핑이 가능하다
 * (백엔드 불변 제약 하의 최선 — 스키마 플래그 추가는 기각됨).
 */
export const SITE_OWNER_NAME = 'han';

/**
 * 사이트 절대 URL 정본 (reuse-audit B-3 / M2).
 * robots·sitemap·feed 3곳이 동일한 폴백 3줄을 복붙하고 있었다.
 * 폴백 도메인 변경(실도메인 이관)은 이번 범위 밖 — 값을 바꾸지 않는다.
 * NEXT_PUBLIC_ 접두사라 클라이언트 번들에도 인라인되므로 이 모듈은 순수 상수로 유지한다.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://blog92.vercel.app';

/** RSS 피드 라우트 경로 정본 (`app/feed.xml/route.ts`). 경로를 옮기면 여기만 고친다. */
export const FEED_PATH = '/feed.xml';

/**
 * RSS 자동탐색 링크(`<link rel="alternate" type="application/rss+xml">`)의 정본.
 *
 * ⚠️ `layout.tsx`에만 두면 안 된다. Next의 메타데이터 병합은 **최상위 키 단위 치환**이지
 *    깊은 병합이 아니다(`next/dist/lib/metadata/resolve-metadata.js`의 `case 'alternates'` —
 *    하위 라우트가 `alternates`를 돌려주면 상위의 `alternates`를 통째로 버린다).
 *    그래서 `alternates: { canonical }`만 반환하는 라우트는 layout의 피드 링크를 **잃는다**.
 *    실제로 목록 4라우트에 canonical을 추가하자마자 `/` `/posts` `/categories/*` `/tags/*`
 *    네 곳에서 피드 자동탐색이 사라졌다(리뷰 H-1). `/feed.xml` 자체는 멀쩡해서 빌드·테스트·화면
 *    어디에도 신호가 없다 — 그래서 `alternates`를 반환하는 곳은 **전부** 이 상수를 함께 실어야 한다.
 *
 * 중복처럼 보여도 지우지 말 것. 회귀 테스트는 `src/app/feed-discovery.test.ts`.
 */
export const RSS_ALTERNATE_TYPES: Record<string, string> = {
  'application/rss+xml': FEED_PATH,
};
