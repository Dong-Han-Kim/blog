import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  DEFAULT_LIST_SORT,
  buildListHref,
  resolveListView,
  type RawSearchParams,
} from '@/lib/posts/pagination';
import { cachedPostsByCategory } from '@/lib/posts/query';
import { RSS_ALTERNATE_TYPES, SITE_URL } from '@/constants/site';
import { CATEGORY_CONTENT } from '@/constants/category-content';
import { CategoryTabs } from '@/components/posts/CategoryTabs';
import { PostList } from '@/components/posts/PostList';
import { ArchiveHeader } from '@/components/shared/ArchiveHeader';
import { DottedRule } from '@/components/terminal/DottedRule';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';
import { PromptLine } from '@/components/terminal/PromptLine';
import { TerminalButton } from '@/components/terminal/TerminalButton';

interface PageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * 이 목록의 쿼리 없는 경로 (§3.5). 요청된 경로를 그대로 되돌려 만들어야 페이저 링크와 308
 * 목적지가 **같은 카테고리 경로에 머문다** — 여기서 소문자 slug로 바꾸면 `?page=1` 정규화가
 * 쿼리뿐 아니라 경로까지 조용히 옮긴다.
 */
const basePathFor = (category: string) => `/categories/${encodeURIComponent(category)}`;

/** draft 필터까지 끝난 이 카테고리의 전체 글 — 메타데이터와 본문이 같은 집합을 봐야 한다 */
function publishedPostsOf(category: string) {
  return cachedPostsByCategory(category).filter((post) => !post.draft);
}

// generateStaticParams는 **삭제했다** (feat-list-pagination D-2).
// `?page=`·`?sort=`를 읽는 순간 라우트 전체가 동적이 되어(설계서 실측 E1) 프리렌더가 사라진다.
// 그대로 두면 Next는 무시하는데 사람은 "여기는 프리렌더된다"고 읽는 거짓 신호만 남는다.
//
// ⚠️ 원래 주석이 지키던 의도(결정 D-4ⓐ / reuse-audit C-4)는 여전히 유효하므로 여기 이관한다:
//    **글이 하나도 없는 네비 카테고리도 404가 아니라 200 + "아직 글이 없습니다" 화면이어야 한다.**
//    그 보증의 주체가 "Default_Nav_items 합집합을 프리렌더한다"에서 `getPostsByCategory`의
//    **ENOENT → [] 정책**으로 옮겨갔을 뿐이다 (lib/posts/query.ts의 cachedPostsByCategory 주석).
//    그래서 그 조회를 `cachedAllPosts().filter((p) => p.category === slug)`로 바꾸면
//    없는 디렉토리가 예외로 바뀌며 이 의도가 조용히 깨진다.

/**
 * ⚠️ 여기서는 절대 notFound()/redirect()를 부르지 않는다. 실측 근거(설계 §6.6):
 *    `generateMetadata` **단독** throw는 `notFound()`를 조용히 삼킨다 — 404 UI도 없이 정상
 *    콘텐츠가 200으로 렌더된다. 소프트 404보다 한 단계 나쁘다.
 *    404/308은 **본문 한 곳**이 결정하고, 여기서는 kind !== 'ok'일 때 기본 메타데이터만 돌려준다.
 */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const content = CATEGORY_CONTENT[category.toLowerCase()];
  const title = `${content?.name ?? category} 카테고리`;
  const description = content?.description ?? `${category} 관련 글 모음`;

  const result = resolveListView({
    total: publishedPostsOf(category).length,
    basePath: basePathFor(category),
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
      canonical: `${SITE_URL}${buildListHref(basePathFor(category), { page, sort })}`,
      types: RSS_ALTERNATE_TYPES,
    },
    // 비기본 정렬은 같은 글 집합의 순서만 바꾼 중복이라 색인시키지 않되 링크는 따라가게 둔다
    ...(sort === DEFAULT_LIST_SORT
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

/**
 * 카테고리 페이지 (핸드오버 6b, 0건은 8a — 설계 §7.3).
 * 브레드크럼 `cd categories/{slug}` + 46px 대문자 타이틀 + 설명 +
 * 우측 `{n} ENTRIES`/경로 + 탭 + 필터된 목록(인덱스 01부터 재시작).
 *
 * `export const dynamic`은 쓰지 않는다 — searchParams 접근만으로 이미 동적이고(실측 E1),
 * force-static은 파라미터를 조용히 빈 객체로 만든다(E4).
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { category } = await params;
  const slug = category.toLowerCase();
  const content = CATEGORY_CONTENT[slug];

  // 정렬·슬라이스는 PostList가 정본 함수(lib/posts/sort.ts)로 수행 — 페이지는 draft 필터만
  const posts = publishedPostsOf(category);

  // ⚠️ 0건 분기보다 **먼저** 해석한다 (§7.3). 빈 카테고리의 `?page=2`도 404여야 하는데,
  //    0건 화면을 먼저 렌더하면 존재하지 않는 페이지가 조용히 200으로 빠져나간다.
  const result = resolveListView({
    total: posts.length,
    basePath: basePathFor(category),
    params: await searchParams,
  });
  if (result.kind === 'not-found') notFound();
  // 308 Permanent — 기본값 생략·잘못된 sort 제거는 영구 규칙이다.
  // Next의 redirect()는 307(temporary)이라 검색엔진이 정규형을 합치지 않는다.
  if (result.kind === 'redirect') permanentRedirect(result.to);
  // ⚠️ 위 3줄을 헬퍼로 묶지 말 것 (설계 §2 / D-4) — 프레임워크 예외를 헬퍼 안으로 숨기면
  //    언젠가 try/catch에 삼켜져 소프트 404가 된다(mdx.ts QA-H1). 의도된 중복이다.

  return (
    <>
      <PromptLine command={`cd categories/${slug}`} className="mt-44 mb-26" />
      <ArchiveHeader
        title={content?.name ?? category}
        titleClassName="text-cat-title uppercase max-md:text-[30px]"
        description={content?.description}
        // 이 카테고리의 **전체 개수**를 유지한다 — 현재 페이지에 보이는 수가 아니다 (§7.3)
        entryCount={posts.length}
        path={`categories/${slug}/`}
      />
      <CategoryTabs active={slug} />
      {posts.length === 0 ? (
        <section>
          <DottedRule left="0 ENTRIES" className="mb-2" />
          <div className="border-y border-rule py-52 text-center">
            <p className="text-[13px] leading-[2.2] text-error">
              ls: categories/{slug}: 아직 글이 없습니다
            </p>
            <p className="mt-14 text-[12px] text-text-dim">
              이 카테고리는 준비 중입니다.
            </p>
            <TerminalButton href="/" className="mt-30">
              <span className="text-text-faint">$</span>
              <span>cd ~ — 전체 글 보기</span>
            </TerminalButton>
          </div>
        </section>
      ) : (
        <PostList posts={posts} view={result.view} />
      )}
      <FooterPrompt command="cd .." className="mt-56" />
    </>
  );
}
