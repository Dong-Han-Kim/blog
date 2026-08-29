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
