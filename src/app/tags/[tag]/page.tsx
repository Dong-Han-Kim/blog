import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  DEFAULT_LIST_SORT,
  buildListHref,
  resolveListView,
  type RawSearchParams,
} from '@/lib/posts/pagination';
import { cachedPostsByTag, cachedPublishedPosts } from '@/lib/posts/query';
import { countTags, sortTagsByCount } from '@/lib/posts/tags';
import { tagHref } from '@/lib/routes';
import { RSS_ALTERNATE_TYPES, SITE_URL } from '@/constants/site';
import { PostList } from '@/components/posts/PostList';
import { TagIndexPanel, type TagIndexEntry } from '@/components/posts/TagIndexPanel';
import { ArchiveHeader } from '@/components/shared/ArchiveHeader';
import { PromptLine } from '@/components/terminal/PromptLine';

interface PageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * ⚠️ `cachedPostsByTag`는 원본 `getPostsByTag`와 동일하게 **draft를 포함한다**
 *    (mdx.contract.test.ts). 이 2차 필터를 "캐시 래퍼가 걸러주겠지"라고 없애면 초안이 노출된다.
 */
function publishedPostsOf(tag: string) {
  return cachedPostsByTag(tag).filter((post) => !post.draft);
}

// generateStaticParams는 **삭제했다** (feat-list-pagination D-2).
// `?page=`·`?sort=`를 읽는 순간 라우트 전체가 동적이 되어(설계서 실측 E1) 프리렌더가 사라진다.
// 그대로 두면 Next는 무시하는데 사람은 "여기는 프리렌더된다"고 읽는 거짓 신호만 남는다.
//
// ⚠️ 원래 주석이 담고 있던 의도(결정 D-4ⓐ)는 아래 본문이 그대로 보증한다:
//    **draft 전용 태그는 프리렌더 대상이 아니었고, 지금도 0건 → notFound()로 404다.**
//    프리렌더 목록이 아니라 본문의 2단 0건 분기가 그 경계를 지킨다.

/** draft 제외 전체 글에서 태그 사용 빈도를 집계한다 (빈도 내림차순, 동률은 이름순) */
function buildTagIndex(): TagIndexEntry[] {
  // 요청 스코프 캐시 — 본문·태그 인덱스·메타데이터가 파일시스템을 각각 훑지 않는다 (§10)
  return sortTagsByCount(countTags(cachedPublishedPosts())).map(
    ([name, count]) => ({ name, count }),
  );
}

/**
 * ⚠️ 여기서는 절대 notFound()/redirect()를 부르지 않는다. 실측 근거(설계 §6.6):
 *    `generateMetadata` **단독** throw는 `notFound()`를 조용히 삼킨다 — 404 UI도 없이 정상
 *    콘텐츠가 200으로 렌더된다. 소프트 404보다 한 단계 나쁘다.
 *    404/308은 **본문 한 곳**이 결정하고, 여기서는 kind !== 'ok'일 때 기본 메타데이터만 돌려준다.
 *    0건 태그(404)도, 범위를 벗어난 `?page=`도 여기서 던지지 않는다.
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const title = `#${decoded} 태그`;
  const description = `${decoded} 태그가 포함된 글 모음`;

  const posts = publishedPostsOf(decoded);
  if (posts.length === 0)
    return { title, description, alternates: { types: RSS_ALTERNATE_TYPES } };

  const basePath = tagHref(decoded);
  const result = resolveListView({
    total: posts.length,
    basePath,
    params: await searchParams,
  });

  // 이 분기는 alternates를 생략해도 layout 값이 상속되지만, 일부러 명시한다 —
  // 나중에 여기에 canonical 한 줄이 추가되는 순간 피드 링크가 조용히 치환된다 (리뷰 H-1).
  if (result.kind !== 'ok')
    return { title, description, alternates: { types: RSS_ALTERNATE_TYPES } };

  const { page, totalPages, sort } = result.view;
  return {
    // 1페이지는 기존 제목 그대로 — 2페이지부터만 위치를 붙인다
    title: page > 1 ? `${title} (${page}/${totalPages})` : title,
    description,
    // canonical은 자기 자신 (§9). metadataBase가 없으므로 SITE_URL로 절대 URL을 만든다.
    // ⚠️ RSS 자동탐색 링크를 canonical과 **함께** 실어야 한다. Next의 메타데이터 병합은
    //    최상위 키 단위 치환이라, `alternates`를 반환하는 순간 layout의 `alternates.types`가
    //    통째로 사라진다 — 중복으로 보여도 지우면 피드 자동탐색이 조용히 죽는다 (리뷰 H-1).
    //    값의 출처는 `@/constants/site`의 RSS_ALTERNATE_TYPES 한 곳이다.
    alternates: {
      canonical: `${SITE_URL}${buildListHref(basePath, { page, sort })}`,
      types: RSS_ALTERNATE_TYPES,
    },
    // 비기본 정렬은 같은 글 집합의 순서만 바꾼 중복이라 색인시키지 않되 링크는 따라가게 둔다
    ...(sort === DEFAULT_LIST_SORT
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

/**
 * 태그별 목록 (핸드오버 8c — 설계 §7.4).
 * 브레드크럼 `grep -rl "#{Tag}" posts/` + 40px `#태그명` 헤더 +
 * ALL TAGS 인덱스 패널 + 필터된 목록(인덱스 01부터). 0건은 notFound() 유지.
 *
 * `export const dynamic`은 쓰지 않는다 — searchParams 접근만으로 이미 동적이고(실측 E1),
 * force-static은 파라미터를 조용히 빈 객체로 만든다(E4).
 */
export default async function TagPage({ params, searchParams }: PageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const posts = cachedPostsByTag(decoded);

  if (!posts || posts.length === 0) notFound();

  // 정렬·슬라이스는 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만.
  // ⚠️ 필터를 여기 다시 적지 말고 `publishedPostsOf`를 쓴다 (리뷰 L-1). generateMetadata가
  //    그 헬퍼로 totalPages를 계산하므로, 본문이 자체 필터를 쓰면 "발행"의 정의가 바뀌는 날
  //    <title>의 페이지 수와 페이저가 조용히 갈라진다. 조회는 요청 스코프 캐시라 재스캔이 없다.
  const publishedPosts = publishedPostsOf(decoded);

  if (publishedPosts.length === 0) notFound();

  // ⚠️ 순서를 바꾸지 말 것: 태그의 존재 여부(0건 → 404)를 먼저 확정한 **다음** 페이지를 해석한다.
  //    존재하지 않는 태그의 `?page=1`을 먼저 308로 돌려보내면 리다이렉트 한 번을 낭비하고
  //    "태그는 있는데 페이지가 없다"는 잘못된 신호를 준다.
  const result = resolveListView({
    total: publishedPosts.length,
    basePath: tagHref(decoded),
    params: await searchParams,
  });
  if (result.kind === 'not-found') notFound();
  // 308 Permanent — 기본값 생략·잘못된 sort 제거는 영구 규칙이다.
  // Next의 redirect()는 307(temporary)이라 검색엔진이 정규형을 합치지 않는다.
  if (result.kind === 'redirect') permanentRedirect(result.to);
  // ⚠️ 위 3줄을 헬퍼로 묶지 말 것 (설계 §2 / D-4) — 프레임워크 예외를 헬퍼 안으로 숨기면
  //    언젠가 try/catch에 삼켜져 소프트 404가 된다(mdx.ts QA-H1). 의도된 중복이다.

  const tagIndex = buildTagIndex();

  return (
    <>
      <PromptLine
        command={`grep -rl "#${decoded}" posts/`}
        className="mt-44 mb-26"
      />
      <ArchiveHeader
        title={`#${decoded}`}
        titleClassName="text-[40px] leading-[1.3] max-md:text-[28px]"
        description="이 태그가 달린 글"
        // 이 태그의 **전체 개수**를 유지한다 — 현재 페이지에 보이는 수가 아니다
        entryCount={publishedPosts.length}
        path={`tags/${decoded.toLowerCase()}/`}
      />
      <TagIndexPanel tags={tagIndex} current={decoded} />
      <PostList posts={publishedPosts} view={result.view} />
    </>
  );
}
