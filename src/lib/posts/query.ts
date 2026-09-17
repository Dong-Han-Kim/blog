import { cache } from 'react';

import { getAllPosts, getPostsByCategory } from '@/lib/mdx';

/**
 * 목록 라우트용 **요청 스코프** 조회 래퍼 (설계 §6.2 / §10).
 *
 * ⚠️ `React.cache`는 **한 번의 요청(렌더) 안에서만** 유효한 메모이제이션이다.
 *    - 요청 간·빌드 간 캐시가 **아니다**. 새 요청은 항상 파일시스템을 다시 읽으므로
 *      `content/posts`를 고쳐도 다음 요청에 즉시 반영된다. "글을 고쳤는데 안 바뀐다"는
 *      버그가 생길 여지가 없다 — 모듈 전역 memo를 쓰지 않는 이유가 이것이다(§10).
 *    - 반대로 **요청 밖**(모듈 로드 시점, 스크립트, 테스트)에서 호출하면 메모이제이션 이득이
 *      없을 뿐 동작은 원본과 같다.
 *
 * 도입 이유: 목록 4라우트가 `searchParams`를 읽으면서 동적 렌더링이 되어(§1 E1)
 * `generateMetadata`와 본문 렌더가 같은 요청 안에서 각각 조회를 호출하게 됐다.
 * 전수 스캔 1회가 실측 12.7ms / 175파일 / 1.56MB(E10)이고 `mdx.ts`에는 캐시가 없다.
 * 특히 태그 페이지는 `getPostsByTag` + 태그 인덱스 + `generateMetadata`로 요청당 3회
 * 스캔하는데, 아래 함수들이 모두 `cachedAllPosts` 하나에서 파생되므로 1회로 줄어든다.
 *
 * ⚠️ `mdx.ts`는 수정하지 않는다. 이 파일은 **감싸기만** 하며 에러 정책
 *    (ENOENT → notFound / ZodError → redirect / 카테고리만 `[]`)은 원본 그대로 위임된다.
 *    `cache()`는 throw도 같은 요청 안에서 그대로 재현하므로 소프트 404(QA-H1) 계열의
 *    위험이 새로 생기지 않는다.
 */

/** `getAllPosts()`의 요청 스코프 판. draft를 포함한 전 글 (카테고리 페이지 §7.3이 그대로 쓴다) */
export const cachedAllPosts = cache(getAllPosts);

/**
 * 발행(비-draft) 글. `getPublishedPosts()`와 **같은 정의**를 `cachedAllPosts` 위에서 다시 계산한다.
 *
 * ⚠️ `cache(getPublishedPosts)`로 감싸지 않는 이유: 그 함수는 내부에서 캐시되지 않은
 *    `getAllPosts()`를 부르므로 같은 요청에서 `cachedAllPosts()`와 스캔이 **2회**로 갈라진다.
 *    요청 내 1회 스캔이라는 목적 자체가 사라진다.
 * ⚠️ 그 대가로 draft 필터 술어가 `mdx.ts`의 정본(C-3 / H2-a)과 두 곳에 존재한다.
 *    "발행"의 정의가 바뀌면(예: 미래 날짜 제외) **두 곳을 같이** 고쳐야 한다.
 * ⚠️ 정렬하지 않는다 — 정렬 정본은 `lib/posts/sort.ts`다 (원본과 동일한 계약).
 */
export const cachedPublishedPosts = cache(() =>
  cachedAllPosts().filter((post) => !post.draft),
);

/**
 * 태그별 글. `getPostsByTag()`와 동일하게 **완전 일치**로만 모으고 **draft를 포함**한다
 * (mdx.contract.test.ts). `/tags/[tag]`의 2차 draft 필터는 계속 필요하다.
 * 위와 같은 이유로 `cache(getPostsByTag)` 대신 `cachedAllPosts` 위에서 파생한다.
 */
export const cachedPostsByTag = cache((tag: string) =>
  cachedAllPosts().filter((post) => post.tags.includes(tag)),
);

/**
 * 카테고리별 글. `mdx.ts` 원본을 그대로 감싼다.
 *
 * ⚠️ `cachedAllPosts().filter((p) => p.category === slug)`로 바꾸지 말 것.
 *    ① `getPostsByCategory`는 **디렉토리 이름**으로 읽고 `post.category`는 frontmatter 값이라
 *       둘이 어긋나는 글이 하나라도 생기면 카테고리 페이지가 조용히 달라진다.
 *    ② 없는 카테고리에 대한 `[]` 반환(글 없는 네비 카테고리 200 응답, D-4ⓐ)이 사라진다.
 *    스캔 범위가 카테고리 디렉토리 하나라 전수 스캔보다 애초에 싸다.
 */
export const cachedPostsByCategory = cache(getPostsByCategory);
