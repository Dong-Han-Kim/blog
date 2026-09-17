import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  DEFAULT_LIST_SORT,
  buildListHref,
  resolveListView,
  type RawSearchParams,
} from '@/lib/posts/pagination';
import { cachedPublishedPosts } from '@/lib/posts/query';
import { RSS_ALTERNATE_TYPES, SITE_URL } from '@/constants/site';
import { PostList } from '@/components/posts/PostList';
import { IndexPageShell } from '@/components/shared/IndexPageShell';

/** 이 목록의 쿼리 없는 경로 — 페이저·canonical·308 목적지가 전부 여기서 파생된다 (§3.5) */
const BASE_PATH = '/posts';

const DESCRIPTION = '모든 블로그 포스트를 확인하세요.';

interface PageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * 정적 `metadata` export를 승격한 것 (feat-list-pagination §7.2 / §9).
 *
 * ⚠️ 여기서는 절대 notFound()/redirect()를 부르지 않는다. 실측 근거(설계 §6.6):
 *    `generateMetadata` **단독** throw는 `notFound()`를 조용히 삼킨다 — 404 UI도 없이 정상
 *    콘텐츠가 200으로 렌더된다. 소프트 404보다 한 단계 나쁘다.
 *    404/308은 **본문 한 곳**이 결정하고, 여기서는 kind !== 'ok'일 때 기본 메타데이터만 돌려준다.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const result = resolveListView({
    total: cachedPublishedPosts().length,
    basePath: BASE_PATH,
    params: await searchParams,
  });

  // 이 분기는 alternates를 생략해도 layout 값이 상속되지만, 일부러 명시한다 —
  // 나중에 여기에 canonical 한 줄이 추가되는 순간 피드 링크가 조용히 치환된다 (리뷰 H-1).
  if (result.kind !== 'ok')
    return {
      title: '전체 글 목록',
      description: DESCRIPTION,
      alternates: { types: RSS_ALTERNATE_TYPES },
    };

  const { page, totalPages, sort } = result.view;
  return {
    // 1페이지는 기존 제목 그대로 — 2페이지부터만 위치를 붙인다
    title: page > 1 ? `전체 글 목록 (${page}/${totalPages})` : '전체 글 목록',
    description: DESCRIPTION,
    // canonical은 **자기 자신**이다. 2페이지를 1페이지로 정규화하지 않는다 —
    // 페이지마다 내용이 다르고 Google도 2019년 이후 그 방식을 권고하지 않는다 (§9).
    // metadataBase가 없으므로 SITE_URL로 절대 URL을 만든다.
    // ⚠️ RSS 자동탐색 링크를 canonical과 **함께** 실어야 한다. Next의 메타데이터 병합은
    //    최상위 키 단위 치환이라, `alternates`를 반환하는 순간 layout의 `alternates.types`가
    //    통째로 사라진다 — 중복으로 보여도 지우면 피드 자동탐색이 조용히 죽는다 (리뷰 H-1).
    //    값의 출처는 `@/constants/site`의 RSS_ALTERNATE_TYPES 한 곳이다.
    alternates: {
      canonical: `${SITE_URL}${buildListHref(BASE_PATH, { page, sort })}`,
      types: RSS_ALTERNATE_TYPES,
    },
    // 비기본 정렬은 같은 글 집합의 순서만 바꾼 중복이라 색인시키지 않되 링크는 따라가게 둔다
    ...(sort === DEFAULT_LIST_SORT
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

// 미디자인 인덱스 — 톤만 맞춤 (설계 §7.10). Card 그리드 → 홈과 동일 PostList 재사용
// `export const dynamic`은 쓰지 않는다 — searchParams 접근만으로 이미 동적이고(실측 E1),
// force-static은 파라미터를 조용히 빈 객체로 만든다(E4).
export default async function PostsPage({ searchParams }: PageProps) {
  // 정렬·슬라이스는 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const allPosts = cachedPublishedPosts();

  const result = resolveListView({
    total: allPosts.length,
    basePath: BASE_PATH,
    params: await searchParams,
  });
  if (result.kind === 'not-found') notFound();
  // 308 Permanent — 기본값 생략·잘못된 sort 제거는 영구 규칙이다.
  // Next의 redirect()는 307(temporary)이라 검색엔진이 정규형을 합치지 않는다.
  if (result.kind === 'redirect') permanentRedirect(result.to);
  // ⚠️ 위 3줄을 헬퍼로 묶지 말 것 (설계 §2 / D-4). notFound()·redirect()는 NEXT_HTTP_ERROR를
  //    throw하는 API라 헬퍼 안으로 숨기면 언젠가 try/catch에 삼켜져 "200인데 사실은 실패"인
  //    소프트 404가 된다 — mdx.ts 상단 주석(QA-H1)과 같은 함정이다. 의도된 중복이다.

  return (
    <IndexPageShell command="ls posts/" title="전체 글">
      <PostList posts={allPosts} view={result.view} />
    </IndexPageShell>
  );
}
