import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PostList } from './PostList';
import {
  POSTS_PER_PAGE,
  buildListHref,
  resolveListView,
  type ListSort,
  type ListView,
} from '@/lib/posts/pagination';
import { sortPostsByDate } from '@/lib/posts/sort';
import { tagHref } from '@/lib/routes';
import type { PostMeta } from '@/types/common';

/**
 * QA 계약 테스트 — 목록 렌더 (feat-list-pagination 설계서 §8.1 / §8.4).
 *
 * ⚠️ 확장자는 반드시 `.test.ts` 다 (vitest unit 프로젝트가 `src/**\/*.test.ts`만 include —
 *    `.test.tsx`는 실패 없이 조용히 미실행된다). JSX 대신 createElement + renderToStaticMarkup.
 *
 * **이 파일이 존재하는 이유**: feat-list-pagination이 `ListPager`(pager.contract.test.ts)와
 * `pagination.ts`(golden + contract)는 촘촘히 덮었지만, 둘을 실제로 붙이는 `PostList`에는
 * 테스트가 한 건도 없었다. 그 결과 아래 넷이 **타입으로도 기존 테스트로도 잡히지 않는 상태**였다:
 *
 *   ① 전역 연번(§8.4). `index={view.start + i + 1}`을 `i + 1`로 되돌리면 2페이지가 다시 `01`부터
 *      시작한다. 화면은 멀쩡해 보이고 페이저 테스트는 전부 통과한다.
 *   ② 슬라이스. `slice(view.start, view.end)`를 빠뜨려도 175건이 다 그려질 뿐 에러가 없다.
 *   ③ 정렬 링크가 page를 버리는 것(§3.4). `{ page: view.page, sort: ... }`로 되돌리면
 *      "최신순 5페이지 → 오래된순 5페이지"라는 **아무 관계 없는 집합**으로 튀는데,
 *      URL도 화면도 그럴듯해서 눈으로는 발견되지 않는다.
 *   ④ 헤더 `PAGE 02/09` 조판(§8.1).
 *
 * DV-1의 경고가 정확히 여기에 걸린다: `SortToggle`이 판별 유니온으로 남아 `onToggle`도
 * 유효하므로, `href` 링크화가 누락돼도 **tsc는 0 에러**다. 그 안전망을 이 파일이 대신한다.
 */

/** 날짜만 다른 최소 PostMeta — 정렬이 결정적이도록 slug도 함께 순증시킨다 */
function makePost(n: number): PostMeta {
  const day = String((n % 28) + 1).padStart(2, '0');
  const month = String((Math.floor(n / 28) % 12) + 1).padStart(2, '0');
  return {
    title: `글 ${n}`,
    date: `2026-${month}-${day}`,
    category: 'backend',
    tags: ['tag'],
    description: `설명 ${n}`,
    keywords: ['k'],
    draft: false,
    slug: `post-${String(n).padStart(3, '0')}`,
    readingTime: 1,
  };
}

const makePosts = (n: number) => Array.from({ length: n }, (_, i) => makePost(i));

/** resolveListView가 보증하는 불변식 그대로 (start/end/totalPages) — 페이지가 넘기는 것과 같은 모양 */
function makeView(input: {
  page: number;
  total: number;
  sort?: ListSort;
  basePath?: string;
}): ListView {
  const { page, total, sort = 'newest', basePath = '/posts' } = input;
  const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const start = (page - 1) * POSTS_PER_PAGE;
  return {
    page,
    totalPages,
    total,
    sort,
    start,
    end: Math.min(start + POSTS_PER_PAGE, total),
    basePath,
  };
}

const render = (posts: PostMeta[], view: ListView) =>
  renderToStaticMarkup(h(PostList, { posts, view }));

/** 목록 행의 순번 칩. PostRow가 `padStart(2,'0')`한 값을 `<span>`에 그대로 넣는다 */
function rowIndexes(markup: string): string[] {
  return [...markup.matchAll(/<span class="[^"]*">(\d{2,})<\/span>/g)].map((m) => m[1]);
}

/** 본문 행이 가리키는 글 slug 순서 (PostRow의 오버레이 링크) */
function rowSlugs(markup: string): string[] {
  return [...markup.matchAll(/href="\/posts\/(post-\d+)"/g)].map((m) => m[1]);
}

/** HTML 속성의 `&amp;`를 되돌린다 */
const hrefsOf = (markup: string): string[] =>
  [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));

const TOTAL = 175;

describe('PostList — 전역 연번 (§8.4: 페이지마다 01로 재시작하지 않는다)', () => {
  it.each([
    [1, '01', '20'],
    [2, '21', '40'],
    [5, '81', '100'],
    [9, '161', '175'],
  ])('%i페이지의 첫 행은 [%s], 마지막 행은 [%s]', (page, first, last) => {
    const idx = rowIndexes(render(makePosts(TOTAL), makeView({ page, total: TOTAL })));
    expect(idx[0]).toBe(first);
    expect(idx[idx.length - 1]).toBe(last);
  });

  it('9페이지 전수에서 연번이 끊기지 않고 1..175를 정확히 한 번씩 덮는다', () => {
    const seen: number[] = [];
    for (let page = 1; page <= 9; page++) {
      for (const n of rowIndexes(render(makePosts(TOTAL), makeView({ page, total: TOTAL })))) {
        seen.push(Number(n));
      }
    }
    expect(seen).toEqual(Array.from({ length: TOTAL }, (_, i) => i + 1));
  });

  it('목록이 바뀌면(카테고리·태그) 연번은 그 목록 기준 01부터다 — 재시작 단위는 페이지가 아니라 집합이다', () => {
    const idx = rowIndexes(render(makePosts(8), makeView({ page: 1, total: 8, basePath: '/categories/linux' })));
    expect(idx[0]).toBe('01');
    expect(idx[idx.length - 1]).toBe('08');
  });
});

describe('PostList — 슬라이스 (view가 정한 창만 렌더한다)', () => {
  it.each([1, 2, 5, 8])('%i페이지는 정확히 POSTS_PER_PAGE건이다', (page) => {
    expect(rowSlugs(render(makePosts(TOTAL), makeView({ page, total: TOTAL })))).toHaveLength(
      POSTS_PER_PAGE,
    );
  });

  it('마지막 페이지는 나머지만 렌더한다 (175 → 15건)', () => {
    expect(rowSlugs(render(makePosts(TOTAL), makeView({ page: 9, total: TOTAL })))).toHaveLength(15);
  });

  it('9페이지를 이어붙이면 전체 175건을 중복 없이 빠짐없이 덮는다', () => {
    const all: string[] = [];
    for (let page = 1; page <= 9; page++) {
      all.push(...rowSlugs(render(makePosts(TOTAL), makeView({ page, total: TOTAL }))));
    }
    expect(all).toHaveLength(TOTAL);
    expect(new Set(all).size).toBe(TOTAL);
  });

  it('렌더 순서는 정본 함수(sortPostsByDate)의 결과와 문자열 단위로 같다 — props 순서에 의존하지 않는다', () => {
    const posts = makePosts(TOTAL);
    const shuffled = [...posts].reverse(); // 일부러 어긋난 순서로 넘긴다
    const view = makeView({ page: 3, total: TOTAL });
    const expected = sortPostsByDate(posts, 'newest')
      .slice(view.start, view.end)
      .map((p) => p.slug);
    expect(rowSlugs(render(shuffled, view))).toEqual(expected);
  });

  it('오래된순 1페이지는 최신순 마지막 페이지의 역순이다', () => {
    const posts = makePosts(TOTAL);
    const newestLast = rowSlugs(render(posts, makeView({ page: 9, total: TOTAL })));
    const oldestFirst = rowSlugs(
      render(posts, makeView({ page: 1, total: TOTAL, sort: 'oldest' })),
    );
    expect(oldestFirst.slice(0, newestLast.length)).toEqual([...newestLast].reverse());
  });
});

describe('PostList — 헤더 조판 (§8.1)', () => {
  it('여러 페이지면 `{total} ENTRIES · PAGE nn/nn`', () => {
    expect(render(makePosts(TOTAL), makeView({ page: 2, total: TOTAL }))).toContain(
      '175 ENTRIES · PAGE 02/09',
    );
  });

  it('1페이지뿐이면 `PAGE 01/01`을 붙이지 않는다 (페이지가 하나인데 위치 표기는 잡음이다)', () => {
    const markup = render(makePosts(8), makeView({ page: 1, total: 8 }));
    expect(markup).toContain('8 ENTRIES');
    expect(markup).not.toContain('PAGE');
  });

  it('0건이면 `0 ENTRIES` 그대로이고 페이저가 없다', () => {
    const markup = render([], makeView({ page: 1, total: 0 }));
    expect(markup).toContain('0 ENTRIES');
    expect(markup).not.toContain('페이지 매김');
  });
});

describe('PostList — 정렬 링크는 page를 버린다 (§3.4)', () => {
  /** DottedRule right 슬롯의 정렬 링크 = `sort=`를 담았거나 basePath 자체인 첫 링크 */
  const sortHref = (markup: string, basePath: string) =>
    hrefsOf(markup).find((href) => href.startsWith(basePath) && !href.includes('page='));

  it.each([1, 2, 5, 9])('%i페이지에서도 정렬 링크에 page가 실리지 않는다', (page) => {
    const href = sortHref(render(makePosts(TOTAL), makeView({ page, total: TOTAL })), '/posts');
    expect(href).toBe('/posts?sort=oldest');
    expect(href).not.toContain('page=');
  });

  it('오래된순에서는 기본값으로 돌아가는 정규형 링크다 (page=1·sort=newest 미표기)', () => {
    const markup = render(makePosts(TOTAL), makeView({ page: 5, total: TOTAL, sort: 'oldest' }));
    expect(hrefsOf(markup)).toContain('/posts');
    expect(hrefsOf(markup)).not.toContain('/posts?sort=newest');
  });

  it('정렬 링크는 반드시 buildListHref의 출력이다 (문자열 직접 조립 금지)', () => {
    for (const sort of ['newest', 'oldest'] as const) {
      const other: ListSort = sort === 'newest' ? 'oldest' : 'newest';
      const markup = render(makePosts(TOTAL), makeView({ page: 4, total: TOTAL, sort }));
      expect(hrefsOf(markup)).toContain(buildListHref('/posts', { sort: other }));
    }
  });

  it('정렬 링크는 <a>다 — <button>으로 되돌리면 새로고침·북마크·새 탭이 성립하지 않는다', () => {
    const markup = render(makePosts(TOTAL), makeView({ page: 1, total: TOTAL }));
    const anchor = /<a[^>]*href="\/posts\?sort=oldest"/.test(markup);
    expect(anchor).toBe(true);
    expect(markup).not.toContain('SORTED BY DATE</button>');
  });

  it('태그 basePath에서도 정렬 링크가 경로 세그먼트를 늘리지 않는다 (슬래시가 든 태그)', () => {
    const basePath = tagHref('a/b');
    const markup = render(makePosts(TOTAL), makeView({ page: 2, total: TOTAL, basePath }));
    const href = hrefsOf(markup).find((x) => x.startsWith('/tags/') && x.includes('sort='));
    expect(href).toBe(`${basePath}?sort=oldest`);
    expect(href!.split('?')[0].split('/')).toHaveLength(3);
  });
});

describe('PostList — 페이지가 넘기는 view와 실제로 맞물린다 (resolveListView 왕복)', () => {
  it.each([
    ['', 1],
    ['2', 2],
    ['9', 9],
  ])('?page=%s 해석 결과를 그대로 렌더하면 연번이 (page-1)*20+1에서 시작한다', (raw, page) => {
    const result = resolveListView({
      total: TOTAL,
      basePath: '/posts',
      params: raw === '' ? {} : { page: raw },
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    const idx = rowIndexes(render(makePosts(TOTAL), result.view));
    expect(Number(idx[0])).toBe((page - 1) * POSTS_PER_PAGE + 1);
  });

  /**
   * PostList의 JSDoc이 명시한 불변식 `view.total === posts.length`는 타입으로 강제되지 않는다.
   * 어긋나면 헤더의 ENTRIES·페이지 수와 실제 목록이 조용히 갈라진다 — 그 갈라짐이 실제로
   * 일어난다는 것을 여기서 고정해 둔다 (호출부가 개수를 잰 바로 그 배열을 넘겨야 하는 이유).
   */
  it('불변식이 깨지면 헤더와 본문이 실제로 어긋난다 — 계약이 공허하지 않다는 증거', () => {
    const markup = render(makePosts(30), makeView({ page: 1, total: TOTAL }));
    expect(markup).toContain('175 ENTRIES'); // 헤더는 view.total을 믿는다
    expect(rowSlugs(markup)).toHaveLength(POSTS_PER_PAGE); // 본문은 실제 배열만 가진다
    // 2페이지를 요청하면 30건짜리 배열에서 10건만 나오는데 헤더는 여전히 175를 말한다
    const p2 = render(makePosts(30), makeView({ page: 2, total: TOTAL }));
    expect(rowSlugs(p2)).toHaveLength(10);
    expect(p2).toContain('175 ENTRIES · PAGE 02/09');
  });
});
