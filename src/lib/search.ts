/**
 * 팔레트 검색 순수 함수 (설계 §7.7) — 테스트 대상.
 * 매칭 규칙(핸드오버): 대소문자 무시, title + slug + tags 이어붙인 문자열의
 * 부분 문자열. 빈 질의는 전체 목록.
 */

export interface SearchPost {
  slug: string;
  title: string;
  tags: string[];
  category: string;
  description?: string | null;
  date?: string;
}

export function filterPosts<T extends SearchPost>(
  posts: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((post) =>
    `${post.title} ${post.slug} ${post.tags.join(' ')}`
      .toLowerCase()
      .includes(q)
  );
}

/** 사용 빈도 상위 n개 태그 (0건 상태의 TRY 칩). 동률은 이름순으로 결정적 정렬 */
export function topTags(posts: SearchPost[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([tag]) => tag);
}

/** run에 필요한 라우터 표면만 — next 내부 AppRouterInstance 타입 딥임포트 회피 */
export interface PaletteRouter {
  // eslint-disable-next-line no-unused-vars -- 타입 시그니처의 파라미터명
  push(href: string): void;
}

export interface PaletteCommand {
  id: 'go-home' | 'go-categories' | 'toggle-crt';
  label: string; // 'cd ~' | 'ls categories/' | 'export CRT=off|on' (동적)
  hint: string; // 'G H' | 'G C' | '⇧ C' (표시 전용)
  // eslint-disable-next-line no-unused-vars -- 타입 시그니처의 파라미터명
  run: (router: PaletteRouter) => void;
}
