import { DEFAULT_POST_SORT, type PostSortOrder } from './sort';

/**
 * 목록 URL 해석 정본 (feat-list-pagination 설계서 §6.1).
 *
 * 네 개 목록 라우트(`/`, `/posts`, `/categories/[category]`, `/tags/[tag]`)가 공유하는
 * `?page=`·`?sort=` 해석을 여기 한 곳에 모은다. **Next도 fs도 import하지 않는 순수 모듈**이라
 * 렌더러 없이 전수 테스트할 수 있다.
 *
 * ⚠️ 이 모듈은 notFound()/redirect()를 호출하지 않는다 (설계서 D-4).
 *    둘 다 NEXT_HTTP_ERROR를 throw하는 API라 헬퍼 안으로 숨기면 언젠가 try/catch에 삼켜져
 *    "화면은 200인데 사실은 실패"인 소프트 404가 된다 — mdx.ts가 ZodError를 redirect('/')로
 *    삼킨 QA-H1이 정확히 그 사고였다. 여기서는 판정을 **값으로** 돌려주고, throw는 호출부인
 *    page.tsx의 눈에 보이는 3줄이 한다.
 *
 * 설계 전체를 관통하는 구분 (§3.1):
 *   page = **식별(identity)** 파라미터 — 어떤 리소스인가 → 깨지면 **404**
 *   sort = **표현(presentation)** 파라미터 — 같은 집합의 배열 순서 → 깨지면 **308 정규화**
 * 범위를 벗어난 page를 클램프해 200으로 돌려주는 선택은 기각됐다. 요청과 다른 화면을
 * 200으로 주는 것이 위 QA-H1과 같은 실패 양식이기 때문이다.
 */

/** 페이지당 글 수 — 175편 기준 9페이지 (사용자 확정). 해석(범위 검증)과 렌더가 같은 값을 봐야 하므로 이 모듈이 소유자다 */
export const POSTS_PER_PAGE = 20;

export type ListSort = PostSortOrder; // 'newest' | 'oldest'

/** 정렬 기본값은 sort.ts의 정본을 그대로 쓴다 — 기본 정렬이 두 곳에 생기면 조용히 갈라진다 */
export const DEFAULT_LIST_SORT: ListSort = DEFAULT_POST_SORT;

/**
 * Next의 searchParams 원형.
 * 중복 키는 문자열이 아니라 **배열**로 온다 (`?page=2&page=3` → `['2','3']`, 설계서 §1 실측 E9).
 * 파서가 배열을 반드시 다뤄야 하는 이유이자, 이 타입이 `Record<string,string>`이 아닌 이유다.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** 확정된 목록 뷰. 여기까지 온 값은 전부 유효 범위 안이므로 소비처(PostList/ListPager)는 재검증하지 않는다 */
export interface ListView {
  /** 1-base, 항상 1 ≤ page ≤ totalPages */
  page: number;
  /** max(1, ceil(total / POSTS_PER_PAGE)) — total이 0이어도 1 (페이지 0은 존재하지 않는다) */
  totalPages: number;
  /** 필터 후 전체 글 수 (페이지 수가 아니다) */
  total: number;
  sort: ListSort;
  /** slice 시작 (0-base) */
  start: number;
  /** slice 끝 (exclusive). min(start + POSTS_PER_PAGE, total) */
  end: number;
  /** 쿼리 없는 경로. 이미 인코딩돼 있어야 한다 (태그는 반드시 tagHref() 결과, §3.5) */
  basePath: string;
}

export type ListViewResult =
  | { kind: 'ok'; view: ListView }
  | { kind: 'not-found' }
  | { kind: 'redirect'; to: string };

/**
 * 정규 10진 양의 정수 — 앞자리 0·부호·지수 표기·소수점·공백·전각 숫자를 전부 배제한다.
 * `Number()`는 '01'·'+2'·'1e1'·' 1'을 모두 받아주지만, 받아주면 **같은 페이지에 URL이 여러 개**
 * 생겨 색인·캐시·분석이 갈라진다. 정규형을 하나로 유지하는 것이 이 정규식의 존재 이유다.
 */
const CANONICAL_POSITIVE_INT = /^[1-9][0-9]*$/;

/**
 * page 파라미터 파서.
 *
 * ⚠️ 비대칭 계약: "값이 없음"과 "비정규형"이 **둘 다 null**이다.
 *    resolveListView는 `params.page === undefined`를 먼저 걸러 1페이지로 삼으므로 구분이 되지만,
 *    이 함수를 따로 쓰는 호출부가 생기면 존재 여부를 반드시 먼저 봐야 한다.
 *
 * 범위(totalPages) 검사는 여기서 하지 않는다 — total을 모르기 때문이며,
 * `?page=99999999999999999999`는 정규식을 통과한 뒤 범위 검사에서 걸린다.
 */
export function parsePageParam(raw: string | string[] | undefined): number | null {
  // 배열(중복 키)은 첫 값도 마지막 값도 고르지 않는다. 임의로 하나를 고르는 것은
  // 정의되지 않은 동작을 조용히 결정하는 짓이라, 정의되지 않은 채로 404를 낸다.
  if (typeof raw !== 'string') return null;
  if (!CANONICAL_POSITIVE_INT.test(raw)) return null;
  return Number(raw);
}

/**
 * sort 파라미터 파서. 판정에 필요한 것은 값뿐 아니라 **왜 그 값인가**이므로 kind를 함께 돌려준다.
 *   absent  — 없음 (정규형)
 *   valid   — 'oldest' (정규형)
 *   default — 'newest' 명시 (기본값은 URL에 쓰지 않는다 → 308로 제거)
 *   invalid — 오타·빈 값·배열 (리소스는 존재하므로 404는 과잉 → 308로 제거)
 * invalid의 sort가 기본값인 것이 핵심이다: 화면은 최신순을 보여주되 **URL도 눈에 보이게** 고쳐
 * URL과 화면이 어긋난 채로 남지 않게 한다.
 */
export function parseSortParam(raw: string | string[] | undefined): {
  kind: 'absent' | 'default' | 'valid' | 'invalid';
  sort: ListSort;
} {
  if (raw === undefined) return { kind: 'absent', sort: DEFAULT_LIST_SORT };
  if (raw === 'oldest') return { kind: 'valid', sort: 'oldest' };
  if (raw === 'newest') return { kind: 'default', sort: 'newest' };
  return { kind: 'invalid', sort: DEFAULT_LIST_SORT };
}

/**
 * 목록 URL 파라미터 해석 정본.
 * 판정 순서는 ① page → ② sort → ③ 정규형 여부 (설계서 §6.1). page가 먼저인 이유는,
 * 존재하지 않는 페이지로 가는 308을 만들어 리다이렉트 한 번을 낭비하지 않기 위해서다.
 */
export function resolveListView(input: {
  total: number;
  basePath: string;
  params: RawSearchParams;
}): ListViewResult {
  const { total, basePath, params } = input;
  const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));

  // ① page — 식별 파라미터. 조금이라도 어긋나면 404다 (클램프 금지)
  const rawPage = params.page;
  let page = 1;
  let pageWasExplicit = false;
  if (rawPage !== undefined) {
    const parsed = parsePageParam(rawPage);
    if (parsed === null) return { kind: 'not-found' };
    if (parsed > totalPages) return { kind: 'not-found' };
    page = parsed;
    pageWasExplicit = true;
  }

  // ② sort — 표현 파라미터. 깨져도 리소스는 존재하므로 404가 아니라 정규화다
  const parsedSort = parseSortParam(params.sort);
  const sortNeedsFix = parsedSort.kind === 'default' || parsedSort.kind === 'invalid';

  // ③ 정규형 여부 — 기본값이 URL에 남아 있으면 한 페이지에 URL이 둘이 된다
  if ((pageWasExplicit && page === 1) || sortNeedsFix) {
    return { kind: 'redirect', to: buildListHref(basePath, { page, sort: parsedSort.sort }) };
  }

  const start = (page - 1) * POSTS_PER_PAGE;
  return {
    kind: 'ok',
    view: {
      page,
      totalPages,
      total,
      sort: parsedSort.sort,
      start,
      end: Math.min(start + POSTS_PER_PAGE, total),
      basePath,
    },
  };
}

/**
 * 정규형 URL 조립 (§3.2 / §3.3).
 * 기본값(page 1 / sort newest)은 **쓰지 않는다** — 한 페이지에 URL이 하나만 대응해야
 * 색인·캐시·분석이 갈라지지 않는다. 순서는 `page` → `sort` 고정이라 canonical 문자열이 흔들리지 않는다.
 *
 * basePath는 **이미 인코딩된 경로**여야 한다. 태그는 반드시 lib/routes.ts의 `tagHref()` 결과를 넘길 것 —
 * 직접 조립하면 routes.contract.test.ts가 막고 있는 경로 세그먼트 탈출(`/tags/a/b`)이 페이저 링크에서 재현된다.
 * 여기서는 경로를 건드리지 않고 쿼리만 덧붙이므로 인코딩이 보존된다.
 */
export function buildListHref(
  basePath: string,
  options: { page?: number; sort?: ListSort } = {},
): string {
  const query: string[] = [];
  if (options.page !== undefined && options.page !== 1) query.push(`page=${options.page}`);
  if (options.sort !== undefined && options.sort !== DEFAULT_LIST_SORT) {
    query.push(`sort=${options.sort}`);
  }
  return query.length === 0 ? basePath : `${basePath}?${query.join('&')}`;
}

export type PageSlot = number | 'ellipsis';

/**
 * 페이지 번호 슬롯 계산 (§8.3). `totalPages > 7`이면 **슬롯 수가 7로 고정**돼
 * 페이지를 넘겨도 페이저 레이아웃이 요동치지 않는다.
 *
 *   totalPages <= 7        → [1 … totalPages] 전부
 *   page <= 4              → [1, 2, 3, 4, 5, '…', t]
 *   page >= totalPages - 3 → [1, '…', t-4, t-3, t-2, t-1, t]
 *   그 외                   → [1, '…', page-1, page, page+1, '…', t]
 *
 * 경계가 4/3으로 어긋나 보이지만 의도된 것이다 — 이 배치라야 '…'가 감추는 페이지 수가
 * 항상 2 이상이 된다(한 칸짜리 생략이면 칩을 그리는 편이 더 짧다). 불변식은 계약 테스트가 고정한다.
 * `totalPages >= 1`을 전제한다 (ListView.totalPages의 불변식).
 */
export function buildPageWindow(page: number, totalPages: number): PageSlot[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (page >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}
