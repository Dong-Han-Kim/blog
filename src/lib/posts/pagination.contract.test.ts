import { describe, expect, it } from 'vitest';

import {
  buildListHref,
  buildPageWindow,
  DEFAULT_LIST_SORT,
  POSTS_PER_PAGE,
  resolveListView,
  type ListSort,
  type ListViewResult,
  type PageSlot,
  type RawSearchParams,
} from './pagination';

/**
 * QA 계약 테스트 — 목록 URL 해석의 **대수적 성질** (설계서 §14.2).
 * 골든 테스트(pagination.test.ts)가 §4 표의 개별 판정을 고정한다면, 이 파일은
 * 표에 적히지 않은 조합까지 포함해 "어떤 입력이 와도 무너지면 안 되는 것"을 고정한다.
 *
 * 여기 있는 불변식이 깨지면 나타나는 증상은 전부 조용한 종류다:
 *   · 분할이 깨지면 → 어떤 글이 어느 페이지에서도 안 보이거나 두 페이지에 걸쳐 나온다
 *   · 무루프가 깨지면 → 308이 서로를 가리켜 브라우저가 ERR_TOO_MANY_REDIRECTS로 죽는다
 *   · 윈도우 불변식이 깨지면 → 현재 페이지 번호가 사라지거나 한 칸짜리 생략(… 하나가
 *     페이지 하나를 감춤)이 생겨 페이저가 자기 모순을 일으킨다
 * 어느 것도 단위 골든 몇 개로는 잡히지 않아 성질로 고정한다.
 */

const BASE = '/posts';

/**
 * 리다이렉트 목적지를 **Next가 주는 형태 그대로** 되돌려 파싱한다.
 * 중복 키를 배열로 만드는 것까지 재현해야 "목적지를 다시 평가한다"는 말이 성립한다
 * (설계서 §1 실측 E9 — Next의 searchParams는 중복 키를 배열로 준다).
 */
function parseHref(href: string): { basePath: string; params: RawSearchParams } {
  const queryAt = href.indexOf('?');
  const basePath = queryAt === -1 ? href : href.slice(0, queryAt);
  const query = queryAt === -1 ? '' : href.slice(queryAt + 1);
  const params: RawSearchParams = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const prev = params[key];
    if (prev === undefined) params[key] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else params[key] = [prev, value];
  }
  return { basePath, params };
}

/** 정상·비정상·경계를 섞은 page 값 코퍼스 */
const PAGE_VALUES: (string | string[] | undefined)[] = [
  undefined,
  '1',
  '2',
  '5',
  '9',
  '10',
  '999',
  '0',
  '-1',
  '01',
  '+2',
  '1e1',
  '1.5',
  'abc',
  '',
  ' ',
  '２',
  '99999999999999999999',
  ['2', '3'],
  ['1'],
];

/** 정상·비정상·경계를 섞은 sort 값 코퍼스 */
const SORT_VALUES: (string | string[] | undefined)[] = [
  undefined,
  'newest',
  'oldest',
  'OLDEST',
  'old',
  '',
  'date',
  ['oldest', 'newest'],
];

const TOTALS = [0, 1, 19, 20, 21, 40, 41, 175, 200];

/** 코퍼스 전수 조합 — 이 파일의 성질 검사는 전부 이 집합 위에서 돌린다 */
function* allCases(): Generator<{ total: number; params: RawSearchParams }> {
  for (const total of TOTALS) {
    for (const page of PAGE_VALUES) {
      for (const sort of SORT_VALUES) {
        const params: RawSearchParams = {};
        if (page !== undefined) params.page = page;
        if (sort !== undefined) params.sort = sort;
        yield { total, params };
      }
    }
  }
}

const totalPagesOf = (total: number) => Math.max(1, Math.ceil(total / POSTS_PER_PAGE));

describe('판정 삼분할 — 결과는 세 가지뿐이고, 그중 무엇도 "다른 화면을 200으로" 주지 않는다', () => {
  it('모든 입력에 대해 kind는 ok / not-found / redirect 중 하나다', () => {
    for (const { total, params } of allCases()) {
      const result = resolveListView({ total, basePath: BASE, params });
      expect(['ok', 'not-found', 'redirect']).toContain(result.kind);
    }
  });

  // ★ 클램프 금지의 성질 표현 — 범위 밖 page가 ok로 바뀌는 경로가 하나도 없어야 한다.
  //    (mdx.ts QA-H1의 소프트 404와 같은 실패 양식을 구조적으로 차단한다)
  it('정규 정수가 아니거나 범위를 벗어난 page는 어떤 total·sort 조합에서도 ok가 되지 않는다', () => {
    const badPages = ['0', '-1', '01', '+2', '1e1', '1.5', 'abc', '', '２', '999'];
    for (const total of TOTALS) {
      for (const page of badPages) {
        for (const sort of SORT_VALUES) {
          const params: RawSearchParams = { page };
          if (sort !== undefined) params.sort = sort;
          expect(resolveListView({ total, basePath: BASE, params })).toEqual({
            kind: 'not-found',
          });
        }
      }
    }
  });

  it('ok 판정은 요청된 page를 그대로 돌려준다 (요청과 다른 페이지를 보여주지 않는다)', () => {
    for (const total of TOTALS) {
      for (let page = 1; page <= totalPagesOf(total); page += 1) {
        const result = resolveListView({
          total,
          basePath: BASE,
          params: page === 1 ? {} : { page: String(page) },
        });
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') expect(result.view.page).toBe(page);
      }
    }
  });
});

describe('분할 완전성 — 1..totalPages의 [start, end)를 이어붙이면 [0, total)이 정확히 덮인다', () => {
  // 이것이 깨지면 특정 글이 어느 페이지에도 없거나 두 페이지에 중복해서 나온다.
  it('total 0..200 전수에서 빈틈도 중복도 없다', () => {
    for (let total = 0; total <= 200; total += 1) {
      const totalPages = totalPagesOf(total);
      let cursor = 0;
      for (let page = 1; page <= totalPages; page += 1) {
        const result = resolveListView({
          total,
          basePath: BASE,
          params: page === 1 ? {} : { page: String(page) },
        });
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        const { start, end } = result.view;
        expect(start).toBe(cursor); // 빈틈 없음 = 이전 페이지의 end에서 정확히 이어진다
        expect(end).toBeGreaterThanOrEqual(start); // 역전 없음
        cursor = end;
      }
      expect(cursor).toBe(total); // 마지막 페이지의 end가 곧 total
    }
  });

  it('마지막 페이지를 제외하면 모든 페이지가 정확히 POSTS_PER_PAGE건이다', () => {
    for (const total of [0, 1, 20, 21, 175, 200]) {
      const totalPages = totalPagesOf(total);
      for (let page = 1; page < totalPages; page += 1) {
        // 1페이지는 파라미터 없는 형태로 물어야 한다 — ?page=1은 정규형이 아니라 308이다
        const result = resolveListView({
          total,
          basePath: BASE,
          params: page === 1 ? {} : { page: String(page) },
        });
        if (result.kind !== 'ok') throw new Error(`ok가 아니다 (total ${total}, page ${page})`);
        expect(result.view.end - result.view.start).toBe(POSTS_PER_PAGE);
      }
    }
  });

  it('마지막 페이지는 1건 이상 POSTS_PER_PAGE건 이하다 (글이 0건일 때만 예외로 0건)', () => {
    for (let total = 0; total <= 200; total += 1) {
      const totalPages = totalPagesOf(total);
      const result = resolveListView({
        total,
        basePath: BASE,
        params: totalPages === 1 ? {} : { page: String(totalPages) },
      });
      if (result.kind !== 'ok') throw new Error('ok가 아니다');
      const count = result.view.end - result.view.start;
      expect(count).toBeLessThanOrEqual(POSTS_PER_PAGE);
      // 0건 목록만 0건 페이지를 갖는다 — 그 외에 빈 마지막 페이지가 생기면 ?page=N이
      // "존재하지만 아무것도 없는" 화면이 되어 범위 검사가 무의미해진다
      expect(count).toBe(total === 0 ? 0 : ((total - 1) % POSTS_PER_PAGE) + 1);
    }
  });
});

describe('범위 폐쇄성 — ok까지 온 view는 모든 값이 유효 범위 안이다', () => {
  // PostList/ListPager는 view를 다시 검증하지 않는다. 그 신뢰의 근거가 이 테스트다.
  it('1 ≤ page ≤ totalPages, 0 ≤ start < max(1,total), end ≤ total', () => {
    for (const { total, params } of allCases()) {
      const result = resolveListView({ total, basePath: BASE, params });
      if (result.kind !== 'ok') continue;
      const { page, totalPages, start, end, total: viewTotal, sort, basePath } = result.view;
      expect(Number.isInteger(page)).toBe(true);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(totalPages);
      expect(totalPages).toBe(totalPagesOf(total));
      expect(viewTotal).toBe(total); // 페이지가 잰 개수를 그대로 실어 나른다 (§15 view 불변식)
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(Math.max(1, total));
      expect(end).toBeLessThanOrEqual(total);
      expect(start).toBe((page - 1) * POSTS_PER_PAGE);
      expect(['newest', 'oldest']).toContain(sort);
      expect(basePath).toBe(BASE);
    }
  });
});

describe('리다이렉트 무한 루프 없음 — 목적지는 언제나 정규형이다', () => {
  const redirects: { total: number; to: string }[] = [];
  for (const { total, params } of allCases()) {
    const result = resolveListView({ total, basePath: BASE, params });
    if (result.kind === 'redirect') redirects.push({ total, to: result.to });
  }

  it('리다이렉트 케이스가 실제로 수집됐다 (아래 검사가 공허하지 않다는 증거)', () => {
    expect(redirects.length).toBeGreaterThan(20);
  });

  // ★ 이 저장소에서 가장 비싼 실패는 308 → 308 → 308 루프다. 한 번에 수렴해야 한다.
  it('모든 308 목적지를 다시 평가하면 ok다 (체인 길이 1)', () => {
    for (const { total, to } of redirects) {
      const { basePath, params } = parseHref(to);
      const again = resolveListView({ total, basePath, params });
      expect(again.kind, `목적지 ${to} (total ${total})가 ok가 아니다`).toBe('ok');
    }
  });

  it('목적지는 입력과 같은 basePath를 유지한다 (다른 라우트로 튀지 않는다)', () => {
    for (const { to } of redirects) {
      expect(parseHref(to).basePath).toBe(BASE);
    }
  });

  it('목적지에는 page/sort 외의 키가 없다 (순수 함수 유지 — 모르는 키를 끌고 가지 않는다)', () => {
    for (const { to } of redirects) {
      for (const key of Object.keys(parseHref(to).params)) {
        expect(['page', 'sort']).toContain(key);
      }
    }
  });

  it('목적지는 입력 URL과 다르다 (같으면 자기 자신으로 가는 무한 루프다)', () => {
    for (const { total, params } of allCases()) {
      const result = resolveListView({ total, basePath: BASE, params });
      if (result.kind !== 'redirect') continue;
      const incoming = buildIncomingHref(params);
      expect(result.to).not.toBe(incoming);
    }
  });
});

/** 입력 파라미터를 URL 문자열로 되돌린다 (목적지 ≠ 입력 비교용) */
function buildIncomingHref(params: RawSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else query.append(key, value);
  }
  const s = query.toString();
  return s ? `${BASE}?${s}` : BASE;
}

describe('정규형 멱등성 — buildListHref의 출력은 다시 넣어도 그대로 200이다', () => {
  it('유효 범위의 (page, sort) 전 조합에서 리다이렉트가 발생하지 않는다', () => {
    const sorts: ListSort[] = ['newest', 'oldest'];
    for (const total of TOTALS) {
      for (let page = 1; page <= totalPagesOf(total); page += 1) {
        for (const sort of sorts) {
          const href = buildListHref(BASE, { page, sort });
          const { basePath, params } = parseHref(href);
          const result = resolveListView({ total, basePath, params });
          expect(result.kind, `${href} (total ${total})`).toBe('ok');
          if (result.kind !== 'ok') continue;
          // 왕복해도 값이 보존된다 — 직렬화와 해석이 같은 계약을 본다
          expect(result.view.page).toBe(page);
          expect(result.view.sort).toBe(sort);
          // 같은 뷰는 같은 URL로만 표현된다 (canonical 유일성)
          expect(buildListHref(basePath, { page: result.view.page, sort: result.view.sort })).toBe(
            href,
          );
        }
      }
    }
  });

  it('기본값은 출력 어디에도 나타나지 않는다', () => {
    for (const basePath of ['/', '/posts', '/categories/backend', '/tags/a%2Fb']) {
      for (const page of [1, 2, 9]) {
        for (const sort of ['newest', 'oldest'] as ListSort[]) {
          const href = buildListHref(basePath, { page, sort });
          expect(href).not.toContain('page=1&');
          expect(href.endsWith('page=1')).toBe(false);
          expect(href).not.toContain(`sort=${DEFAULT_LIST_SORT}`);
          expect(href.startsWith(basePath)).toBe(true);
          // 쿼리가 붙어도 경로 부분은 훼손되지 않는다 (태그 인코딩 보존)
          expect(parseHref(href).basePath).toBe(basePath);
        }
      }
    }
  });

  it('인자 없는 호출은 basePath 그 자체다 (정렬 링크가 page를 버릴 때 쓰는 형태)', () => {
    for (const basePath of ['/', '/posts', '/tags/%EA%B0%80']) {
      expect(buildListHref(basePath)).toBe(basePath);
    }
  });

  // §3.4 — 정렬 토글 링크는 언제나 page를 버린다.
  it('정렬 변경 링크에는 page가 실리지 않는다 (2페이지끼리는 아무 관계가 없는 집합이다)', () => {
    const toggled = (sort: ListSort) => buildListHref(BASE, { sort });
    expect(toggled('oldest')).toBe('/posts?sort=oldest');
    expect(toggled('newest')).toBe('/posts');
    expect(toggled('oldest')).not.toContain('page');
  });
});

describe('순수성 — 같은 입력에 같은 출력, 입력은 건드리지 않는다', () => {
  it('두 번 호출한 결과가 깊은 값까지 같다', () => {
    for (const { total, params } of allCases()) {
      const a = resolveListView({ total, basePath: BASE, params });
      const b = resolveListView({ total, basePath: BASE, params });
      expect(a).toEqual(b);
    }
  });

  it('입력 params 객체를 변형하지 않는다 (page.tsx가 await한 객체를 그대로 넘긴다)', () => {
    const params: RawSearchParams = { page: '2', sort: ['x', 'y'], utm_source: 'z' };
    const snapshot = structuredClone(params);
    resolveListView({ total: 175, basePath: BASE, params });
    expect(params).toEqual(snapshot);
  });

  it('반환된 view를 고쳐도 다음 호출에 영향이 없다 (내부 상태를 공유하지 않는다)', () => {
    const first = resolveListView({ total: 175, basePath: BASE, params: { page: '2' } });
    if (first.kind !== 'ok') throw new Error('ok가 아니다');
    first.view.page = 99;
    const second = resolveListView({ total: 175, basePath: BASE, params: { page: '2' } });
    expect(second).toMatchObject({ view: { page: 2 } });
  });

  it('Next·fs에 의존하지 않는다 — node 환경에서 모듈이 그대로 평가된다', () => {
    // 이 파일이 import만으로 통과한다는 사실 자체가 계약이다. 해석 모듈에 프레임워크를
    // 들이면 테스트가 렌더러를 띄워야 하고, notFound()/redirect()가 try/catch에 삼켜지는
    // 소프트 404(QA-H1)의 문이 열린다.
    expect(typeof resolveListView).toBe('function');
    expect(typeof buildListHref).toBe('function');
  });
});

describe('buildPageWindow 불변식 — totalPages 1..50 × page 전수 (§8.3)', () => {
  const windows: { page: number; totalPages: number; slots: PageSlot[] }[] = [];
  for (let totalPages = 1; totalPages <= 50; totalPages += 1) {
    for (let page = 1; page <= totalPages; page += 1) {
      windows.push({ page, totalPages, slots: buildPageWindow(page, totalPages) });
    }
  }

  it('첫 페이지와 마지막 페이지를 항상 포함한다 (양 끝으로 가는 길이 사라지지 않는다)', () => {
    for (const { totalPages, slots } of windows) {
      expect(slots).toContain(1);
      expect(slots).toContain(totalPages);
    }
  });

  it('현재 페이지를 항상 포함한다 (내가 어디 있는지 표시할 칩이 없어지면 안 된다)', () => {
    for (const { page, slots } of windows) {
      expect(slots).toContain(page);
    }
  });

  it('숫자는 순증하고 범위를 벗어나지 않는다', () => {
    for (const { totalPages, slots } of windows) {
      const numbers = slots.filter((s): s is number => typeof s === 'number');
      for (const n of numbers) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(totalPages);
      }
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
      expect(new Set(numbers).size).toBe(numbers.length); // 중복 없음
    }
  });

  it("'ellipsis'가 연속하지 않고 양 끝에 오지 않는다", () => {
    for (const { slots } of windows) {
      expect(slots[0]).toBe(1);
      expect(typeof slots[slots.length - 1]).toBe('number');
      for (let i = 1; i < slots.length; i += 1) {
        expect(slots[i] === 'ellipsis' && slots[i - 1] === 'ellipsis').toBe(false);
      }
    }
  });

  // ★ 한 칸짜리 생략 금지 — '…' 하나가 페이지 하나를 감추면 칩을 그리는 편이 더 짧다.
  it("'ellipsis'가 감추는 페이지 수는 항상 2 이상이다", () => {
    for (const { slots } of windows) {
      for (let i = 0; i < slots.length; i += 1) {
        if (slots[i] !== 'ellipsis') continue;
        const before = slots[i - 1];
        const after = slots[i + 1];
        expect(typeof before).toBe('number');
        expect(typeof after).toBe('number');
        expect((after as number) - (before as number) - 1).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('슬롯 수는 totalPages ≤ 7이면 totalPages, 그보다 크면 항상 7이다', () => {
    for (const { totalPages, slots } of windows) {
      expect(slots).toHaveLength(totalPages <= 7 ? totalPages : 7);
    }
  });

  it('결정적이다 — 같은 (page, totalPages)는 언제나 같은 배열을 낸다', () => {
    for (const { page, totalPages, slots } of windows) {
      expect(buildPageWindow(page, totalPages)).toEqual(slots);
      // 반환 배열을 고쳐도 다음 호출이 오염되지 않는다
      const mutated = buildPageWindow(page, totalPages);
      mutated[0] = 'ellipsis';
      expect(buildPageWindow(page, totalPages)).toEqual(slots);
    }
  });

  it('resolveListView가 낸 view는 언제나 유효한 윈도우를 만든다 (두 함수가 같은 세계를 본다)', () => {
    for (const total of [0, 1, 20, 21, 175, 200, 1000]) {
      const result: ListViewResult = resolveListView({ total, basePath: BASE, params: {} });
      if (result.kind !== 'ok') throw new Error('ok가 아니다');
      const slots = buildPageWindow(result.view.page, result.view.totalPages);
      expect(slots).toContain(result.view.page);
      expect(slots.length).toBeGreaterThanOrEqual(1);
    }
  });
});
