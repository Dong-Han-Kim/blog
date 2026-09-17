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
import { CATEGORY_CONTENT } from '@/constants/category-content';
import { CategoryTabs } from '@/components/posts/CategoryTabs';
import { PostList } from '@/components/posts/PostList';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';

/** 홈의 쿼리 없는 경로 — 페이저·canonical·308 목적지가 전부 여기서 파생된다 (§3.5) */
const BASE_PATH = '/';

interface PageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * 홈은 원래 metadata export가 없어 layout의 `title: 'b.log()'`를 물려받는다 (§7.1).
 * 그 상속을 깨지 않으려고 **1페이지·기본 정렬에서는 title을 돌려주지 않는다** — Next는
 * 부재한 필드만 상위에서 상속하므로, 여기서 같은 문자열을 다시 적으면 제목 정본이 둘로 갈라진다.
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
  if (result.kind !== 'ok') return { alternates: { types: RSS_ALTERNATE_TYPES } };

  const { page, totalPages, sort } = result.view;
  return {
    // 1페이지는 layout의 'b.log()' 상속 유지 — 2페이지 이상만 위치를 붙인다
    ...(page > 1 ? { title: `b.log() — ${page}/${totalPages}` } : {}),
    // canonical은 자기 자신 (§9). metadataBase가 없으므로 SITE_URL로 절대 URL을 만든다.
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

/**
 * 홈 — 포스트 목록 (핸드오버 2a/7a, 설계 §7.1).
 * 히어로 2줄 + 통계, 카테고리 탭, 목록(페이저 포함), 푸터 `exit`.
 *
 * `export const dynamic`은 쓰지 않는다 — searchParams 접근만으로 이미 동적이고(실측 E1),
 * force-static은 파라미터를 조용히 빈 객체로 만든다(E4).
 */
export default async function Home({ searchParams }: PageProps) {
  // 정렬·슬라이스는 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const posts = cachedPublishedPosts();

  const result = resolveListView({
    total: posts.length,
    basePath: BASE_PATH,
    params: await searchParams,
  });
  if (result.kind === 'not-found') notFound();
  // 308 Permanent — 기본값 생략·잘못된 sort 제거는 영구 규칙이다.
  // Next의 redirect()는 307(temporary)이라 검색엔진이 정규형을 합치지 않는다.
  if (result.kind === 'redirect') permanentRedirect(result.to);
  // ⚠️ 위 3줄을 헬퍼로 묶지 말 것 (설계 §2 / D-4) — 프레임워크 예외를 헬퍼 안으로 숨기면
  //    언젠가 try/catch에 삼켜져 소프트 404가 된다(mdx.ts QA-H1). 의도된 중복이다.

  const categoryCount = Object.keys(CATEGORY_CONTENT).length;
  const year = new Date().getFullYear();

  return (
    <>
      <section className="mt-64 mb-66 max-w-800 max-md:mt-32 max-md:mb-28">
        <h1 className="font-display text-hero text-text-strong max-md:text-[19px] max-md:leading-[1.85]">
          프론트엔드부터 <br className="md:hidden" />
          인프라까지,
          <br />
          배운 것을 기록합니다.
        </h1>
        <p className="mt-24 text-[13px] leading-[2] text-text-hint max-md:mt-14 max-md:text-[11px]">
          {/* 사이트 규모 표시라 **전체 개수**를 유지한다 — 현재 페이지에 보이는 수가 아니다 (§7.1) */}
          {posts.length} posts · {categoryCount} categories · {year}
        </p>
      </section>
      <CategoryTabs active="ALL" />
      <PostList posts={posts} view={result.view} />
      <FooterPrompt command="exit" className="mt-60" />
    </>
  );
}
