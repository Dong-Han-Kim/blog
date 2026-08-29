/**
 * 라우트 URL 조립 정본 (reuse-audit A-2 / M5).
 * 태그명은 한글·공백·`#`·`&` 를 포함할 수 있어 반드시 퍼센트 인코딩해야 한다.
 * sitemap.ts만 생값을 써서 색인 URL이 실제 페이지 URL과 어긋나 있었다(=404 색인).
 * 노드 의존이 없는 순수 문자열 함수라 서버·클라이언트 양쪽에서 import할 수 있다.
 *
 * 범위: 태그 URL만 다룬다. `/posts/`·`/categories/` 조립은 이번 작업 범위 밖이며
 * (brief §6.2), 필요해지기 전까지 여기에 추가하지 않는다.
 */
export function tagHref(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}`;
}
