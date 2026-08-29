/**
 * 태그·카테고리 빈도 집계 정본 (reuse-audit C-5 / H3-a).
 *
 * ⚠️ 반환 Map의 키 순서 = **첫 등장 순서**(입력 배열 순회 순서)다.
 *    /tags 페이지가 count 동률에서 이 순서에 의존하므로(C-5.I1) 순회 순서를 바꾸지 말 것.
 * ⚠️ 정렬은 여기서 하지 않는다 — 집계와 정렬은 축이 다르다
 *    (태그=빈도순, 카테고리=이름순). 정렬 정본은 C-6에서 sortTagsByCount로 들어온다.
 * fs 등 노드 의존이 없어 클라이언트 번들(lib/search.ts 경유)에서도 안전하다.
 */

/** 문자열 키 목록의 빈도를 센다 — 삽입 순서 = 첫 등장 순서 */
function countKeyList(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** 포스트 배열의 태그 빈도 (post.tags 배열 전개) */
export function countTags(
  posts: readonly { tags: string[] }[],
): Map<string, number> {
  return countKeyList(posts.flatMap((post) => post.tags));
}

/** 포스트 배열의 카테고리 빈도 (post.category 단일값) */
export function countCategories(
  posts: readonly { category: string }[],
): Map<string, number> {
  return countKeyList(posts.map((post) => post.category));
}
