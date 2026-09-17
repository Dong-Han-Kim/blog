import { describe, expect, it } from 'vitest';

import { tagHref } from '@/lib/routes';

import {
  buildListHref,
  buildPageWindow,
  DEFAULT_LIST_SORT,
  POSTS_PER_PAGE,
  parsePageParam,
  parseSortParam,
  resolveListView,
  type ListView,
  type RawSearchParams,
} from './pagination';

/**
 * QA 골든 테스트 — 목록 URL 해석 정본 (feat-list-pagination 설계서 §4 표).
 *
 * 이 파일은 설계서 §4 엣지케이스 표 24행을 1:1로 옮긴 것이다. 표가 곧 명세이므로
 * 구현이 바뀌어도 여기 적힌 판정은 바뀌지 않는다 — 판정을 바꾸려면 설계서를 먼저 고쳐야 한다.
 *
 * 표 전체를 관통하는 단 하나의 원리는 §3.1의 구분이다:
 *   page = **식별(identity)** 파라미터 → 깨지면 **404**  (다른 리소스를 보여주지 않는다)
 *   sort = **표현(presentation)** 파라미터 → 깨지면 **308 정규화** (리소스는 존재한다)
 *
 * ⚠️ 클램프(`?page=999` → 9페이지를 200으로)는 기각됐다. 이 저장소에는 mdx.ts가 ZodError를
 *    redirect('/')로 삼켜 "홈이 뜨지만 사실은 실패"인 소프트 404를 만든 전례(QA-H1)가 있다.
 *    요청과 다른 화면을 200으로 돌려주는 선택은 같은 실패 양식이라 전부 404 또는
 *    **URL이 눈에 보이게 바뀌는 308**로만 처리한다.
 */

/** 설계서 §4의 기준 모수 — 175편 / 페이지당 20편 → totalPages 9 */
const TOTAL = 175;
const BASE = '/posts';

const resolve = (params: RawSearchParams, total = TOTAL, basePath = BASE) =>
  resolveListView({ total, basePath, params });

/** ok 판정의 view 전체를 통째로 고정한다 — 필드 하나가 조용히 어긋나는 것을 막기 위해서다 */
const expectOk = (params: RawSearchParams, view: ListView, total = TOTAL) => {
  expect(resolve(params, total, view.basePath)).toEqual({ kind: 'ok', view });
};

describe('POSTS_PER_PAGE — 해석과 렌더가 공유하는 단일 상수 (D-8)', () => {
  it('20이다 — 175편 기준 9페이지', () => {
    expect(POSTS_PER_PAGE).toBe(20);
    expect(Math.ceil(TOTAL / POSTS_PER_PAGE)).toBe(9);
  });

  it('기본 정렬은 sort.ts의 정본을 그대로 쓴다 (정렬 기본값이 두 곳에 생기지 않도록)', () => {
    expect(DEFAULT_LIST_SORT).toBe('newest');
  });
});

describe('§4 — page 판정 (식별 파라미터: 깨지면 404)', () => {
  // §4 ① (파라미터 없음)
  it('파라미터가 없으면 1페이지·최신순 정규형이다', () => {
    expectOk({}, {
      page: 1,
      totalPages: 9,
      total: TOTAL,
      sort: 'newest',
      start: 0,
      end: 20,
      basePath: BASE,
    });
  });

  // §4 ② ?page=2
  it('?page=2 → 21–40번째 (start/end는 0-base slice 경계다)', () => {
    expectOk({ page: '2' }, {
      page: 2,
      totalPages: 9,
      total: TOTAL,
      sort: 'newest',
      start: 20,
      end: 40,
      basePath: BASE,
    });
  });

  // §4 ③ ?page=9 — 마지막 페이지는 20건 미만 허용
  it('?page=9 → 161–175번째, 마지막 페이지는 20건 미만이어도 ok다', () => {
    expectOk({ page: '9' }, {
      page: 9,
      totalPages: 9,
      total: TOTAL,
      sort: 'newest',
      start: 160,
      end: 175,
      basePath: BASE,
    });
    expect(175 - 160).toBe(15);
  });

  // §4 ④ ?page=10 (범위 초과)
  it('?page=10 (범위 초과) → 404. 클램프하지 않는다', () => {
    // 클램프하면 ?page=999가 영원히 200을 돌려주는 무한 중복 URL이 되고,
    // 사용자에게는 "9페이지를 보고 있는데 주소창은 999"인 상태가 남는다.
    expect(resolve({ page: '10' })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: '999' })).toEqual({ kind: 'not-found' });
  });

  // §4 ⑤⑥⑦⑧⑨⑩⑪ 비정규 정수 — 정규식 ^[1-9][0-9]*$ 불통과
  it.each([
    ['?page=0', '0'],
    ['?page=-1', '-1'],
    ['?page=abc', 'abc'],
    ['?page=1.5', '1.5'],
    ['?page=01 (앞자리 0)', '01'],
    ['?page=+2 (부호)', '+2'],
    ['?page=1e1 (지수 표기)', '1e1'],
    ['?page=２ (전각 숫자)', '２'],
    ['?page= (빈 값)', ''],
    ['?page=  (공백)', ' '],
    ['?page= 2 (앞 공백)', ' 2'],
    ['?page=2  (뒤 공백)', '2 '],
  ])('%s → 404', (_label, raw) => {
    expect(resolve({ page: raw })).toEqual({ kind: 'not-found' });
  });

  // ★ ?page=01 을 받아주지 않는 이유를 못 박아 둔다 — Number()로는 1이 된다.
  it('?page=01 은 Number()로 1이 되지만 받아주지 않는다 (한 페이지에 URL이 2개가 되므로)', () => {
    expect(Number('01')).toBe(1);
    expect(resolve({ page: '01' })).toEqual({ kind: 'not-found' });
    // 1페이지의 정규형은 오직 하나다
    expect(buildListHref(BASE)).toBe('/posts');
  });

  // §4 ⑫ ?page=2&page=3 — Next는 중복 키를 배열로 준다 (설계서 §1 실측 E9)
  it('?page=2&page=3 (배열) → 404. 첫 값/마지막 값을 임의로 고르지 않는다', () => {
    // 임의로 하나를 고르는 것은 "정의되지 않은 동작을 조용히 결정하는" 짓이다.
    expect(resolve({ page: ['2', '3'] })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: ['2'] })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: ['2', '2'] })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: [] })).toEqual({ kind: 'not-found' });
  });

  // §4 ⑬ ?page=99999999999999999999
  it('?page=99999999999999999999 → 정규식은 통과하고 범위 초과에서 걸려 404', () => {
    expect(resolve({ page: '99999999999999999999' })).toEqual({ kind: 'not-found' });
  });

  // §4 ⑭ ?page=1 — 기본값 명시는 정규형이 아니다
  it('?page=1 → 308 basePath (기본값은 URL에 쓰지 않는다)', () => {
    expect(resolve({ page: '1' })).toEqual({ kind: 'redirect', to: '/posts' });
  });

  it('?page=1&sort=oldest → 308 /posts?sort=oldest (비기본 sort는 보존한다)', () => {
    expect(resolve({ page: '1', sort: 'oldest' })).toEqual({
      kind: 'redirect',
      to: '/posts?sort=oldest',
    });
  });
});

describe('§4 — sort 판정 (표현 파라미터: 깨지면 308 정규화)', () => {
  // §4 ⑮ ?sort=oldest
  it('?sort=oldest → 오래된순 1페이지 (정규형이므로 리다이렉트하지 않는다)', () => {
    expectOk({ sort: 'oldest' }, {
      page: 1,
      totalPages: 9,
      total: TOTAL,
      sort: 'oldest',
      start: 0,
      end: 20,
      basePath: BASE,
    });
  });

  it('?page=2&sort=oldest → 21–40번째 오래된순 (두 파라미터가 함께 살아 있는 정규형)', () => {
    expectOk({ page: '2', sort: 'oldest' }, {
      page: 2,
      totalPages: 9,
      total: TOTAL,
      sort: 'oldest',
      start: 20,
      end: 40,
      basePath: BASE,
    });
  });

  // §4 ⑯ ?sort=newest — 기본값 명시
  it('?sort=newest → 308 /posts (기본값 제거)', () => {
    expect(resolve({ sort: 'newest' })).toEqual({ kind: 'redirect', to: '/posts' });
  });

  // §4 ⑰ ?sort=old / ?sort= / ?sort=x&sort=y — 오타는 404가 아니라 308이다
  it.each([
    ['?sort=old', 'old'],
    ['?sort= (빈 값)', ''],
    ['?sort=OLDEST (대문자)', 'OLDEST'],
    ['?sort=oldest  (뒤 공백)', 'oldest '],
    ['?sort=date', 'date'],
  ])('%s → 308 sort 제거 (리소스는 존재하므로 404는 과잉)', (_label, raw) => {
    expect(resolve({ sort: raw })).toEqual({ kind: 'redirect', to: '/posts' });
  });

  it('?sort=x&sort=y (배열) → 308 sort 제거', () => {
    expect(resolve({ sort: ['x', 'y'] })).toEqual({ kind: 'redirect', to: '/posts' });
    // 값이 같아도 배열은 배열이다 — 정의되지 않은 입력을 조용히 해석하지 않는다
    expect(resolve({ sort: ['oldest', 'oldest'] })).toEqual({ kind: 'redirect', to: '/posts' });
  });

  // ★ sort를 고칠 때 page는 살아남는다 — 사용자가 보던 위치를 뺏지 않기 위해서다
  it('?page=2&sort=old → 308 /posts?page=2 (page는 보존한다)', () => {
    expect(resolve({ page: '2', sort: 'old' })).toEqual({
      kind: 'redirect',
      to: '/posts?page=2',
    });
  });

  it('?page=1&sort=newest → 308 /posts (둘 다 기본값이라 둘 다 사라진다)', () => {
    expect(resolve({ page: '1', sort: 'newest' })).toEqual({ kind: 'redirect', to: '/posts' });
  });

  // §4 ⑱ ?page=abc&sort=old — 평가 순서가 판정을 결정한다
  it('?page=abc&sort=old → 404. page 판정이 sort보다 먼저다', () => {
    // 308로 sort만 고쳐 보내면 그 목적지가 다시 404가 되어 리다이렉트 한 번이 낭비된다.
    expect(resolve({ page: 'abc', sort: 'old' })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: '10', sort: 'newest' })).toEqual({ kind: 'not-found' });
    expect(resolve({ page: ['2', '3'], sort: 'oldest' })).toEqual({ kind: 'not-found' });
  });
});

describe('§4 — 목록 크기 경계', () => {
  // §4 ⑲ 0건 목록
  it('0건 목록 → ok, totalPages는 0이 아니라 1이다 (페이지 0은 존재하지 않는다)', () => {
    expectOk({}, {
      page: 1,
      totalPages: 1,
      total: 0,
      sort: 'newest',
      start: 0,
      end: 0,
      basePath: BASE,
    }, 0);
  });

  // §4 ⑳ 0건 + ?page=2
  it('0건 목록 + ?page=2 → 404 (범위 초과 규칙과 같다)', () => {
    expect(resolve({ page: '2' }, 0)).toEqual({ kind: 'not-found' });
  });

  // §4 ㉑ 총 20편 이하
  it.each([1, 19, 20])('총 %i편(1페이지뿐) → ok, totalPages 1', (total) => {
    const result = resolve({}, total);
    expect(result).toEqual({
      kind: 'ok',
      view: {
        page: 1,
        totalPages: 1,
        total,
        sort: 'newest',
        start: 0,
        end: total,
        basePath: BASE,
      },
    });
  });

  // §4 ㉒ 총 20편 이하 + ?page=2
  it.each([0, 1, 20])('총 %i편 + ?page=2 → 404', (total) => {
    expect(resolve({ page: '2' }, total)).toEqual({ kind: 'not-found' });
  });

  it('총 21편이면 2페이지가 생긴다 (경계 바로 다음)', () => {
    expectOk({ page: '2' }, {
      page: 2,
      totalPages: 2,
      total: 21,
      sort: 'newest',
      start: 20,
      end: 21,
      basePath: BASE,
    }, 21);
  });

  // §4 ㉓ 태그 0건 → 기존 notFound() (페이지네이션 이전 단계, 이 모듈 밖)
  it('태그 0건의 404는 이 모듈의 책임이 아니다 — 여기서는 0건도 ok다', () => {
    // 설계서 §7.4: 태그 페이지는 getPostsByTag 0건이면 resolveListView **이전에** notFound()한다.
    // 즉 "글이 0건" 자체는 목록으로서 유효하며(빈 카테고리는 200 + "아직 글이 없습니다"),
    // 존재하지 않는 태그의 404는 페이지가 먼저 판단한다. 이 경계를 흐리면
    // 빈 카테고리 화면이 404로 바뀌어 버린다.
    expect(resolve({}, 0)).toMatchObject({ kind: 'ok' });
  });
});

describe('§3.6 — 알 수 없는 파라미터', () => {
  // §4 ㉔ ?utm_source=x
  it('?utm_source=x → 무시하고 1페이지 ok (외부 유입 링크를 깨지 않는다)', () => {
    expectOk({ utm_source: 'x', utm_medium: ['a', 'b'], fbclid: 'zz' }, {
      page: 1,
      totalPages: 9,
      total: TOTAL,
      sort: 'newest',
      start: 0,
      end: 20,
      basePath: BASE,
    });
  });

  it('리다이렉트 목적지에는 page/sort만 실린다 (모르는 키는 따라가지 않는다)', () => {
    expect(resolve({ page: '1', utm_source: 'x' })).toEqual({
      kind: 'redirect',
      to: '/posts',
    });
  });

  it('들어온 파라미터 순서는 교정하지 않는다 — 순서만 다른 정규형은 그대로 200이다', () => {
    // 외부 링크를 리다이렉트 체인으로 만들 이유가 없다 (§3.3). canonical만 정규 순서를 쓴다.
    expect(resolve({ sort: 'oldest', page: '2' })).toMatchObject({ kind: 'ok' });
  });
});

describe('buildListHref — 정규형 조립 (§3.2 / §3.3)', () => {
  it('기본값은 생략한다 — 한 페이지에 URL은 하나뿐이어야 한다', () => {
    expect(buildListHref('/posts')).toBe('/posts');
    expect(buildListHref('/posts', {})).toBe('/posts');
    expect(buildListHref('/posts', { page: 1 })).toBe('/posts');
    expect(buildListHref('/posts', { sort: 'newest' })).toBe('/posts');
    expect(buildListHref('/posts', { page: 1, sort: 'newest' })).toBe('/posts');
  });

  it('비기본값만 직렬화한다', () => {
    expect(buildListHref('/posts', { page: 2 })).toBe('/posts?page=2');
    expect(buildListHref('/posts', { sort: 'oldest' })).toBe('/posts?sort=oldest');
    expect(buildListHref('/posts', { page: 1, sort: 'oldest' })).toBe('/posts?sort=oldest');
  });

  it('순서는 page → sort 고정이다 (canonical 문자열이 흔들리지 않도록)', () => {
    expect(buildListHref('/posts', { page: 2, sort: 'oldest' })).toBe(
      '/posts?page=2&sort=oldest',
    );
    // 인자 순서를 바꿔도 출력은 같다
    expect(buildListHref('/posts', { sort: 'oldest', page: 2 })).toBe(
      '/posts?page=2&sort=oldest',
    );
  });

  it("홈 basePath '/' 경계 — /?page=2 가 되고 // 가 생기지 않는다", () => {
    expect(buildListHref('/')).toBe('/');
    expect(buildListHref('/', { page: 2 })).toBe('/?page=2');
    expect(buildListHref('/', { page: 2, sort: 'oldest' })).toBe('/?page=2&sort=oldest');
  });

  it('카테고리 basePath', () => {
    expect(buildListHref('/categories/backend', { page: 2 })).toBe(
      '/categories/backend?page=2',
    );
  });

  // ★ 태그는 반드시 tagHref()를 통과한 값을 basePath로 받는다 (§3.5)
  it('태그 basePath — 이미 인코딩된 세그먼트를 훼손하지 않고 경로 세그먼트도 늘리지 않는다', () => {
    const href = buildListHref(tagHref('React 렌더링'), { page: 2 });
    expect(href).toBe('/tags/React%20%EB%A0%8C%EB%8D%94%EB%A7%81?page=2');
    // routes.contract.test.ts가 막고 있는 세그먼트 탈출이 페이저 링크에서 재현되지 않는다
    expect(href.split('?')[0].split('/')).toHaveLength(3);
  });

  it('슬래시가 든 태그도 세그먼트를 늘리지 않는다', () => {
    expect(buildListHref(tagHref('a/b'), { page: 3 })).toBe('/tags/a%2Fb?page=3');
  });
});

describe('buildPageWindow — §8.3 축약 골든', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])('totalPages %i 이하는 전부 보여준다 (생략 없음)', (t) => {
    const slots = buildPageWindow(1, t);
    expect(slots).toEqual(Array.from({ length: t }, (_, i) => i + 1));
    expect(slots).not.toContain('ellipsis');
  });

  it('totalPages 7, page 4 — 7슬롯이 전부 숫자다', () => {
    expect(buildPageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  // 설계서 §8.3의 totalPages = 9 전수 골든표
  it.each([1, 2, 3, 4])('totalPages 9, page %i → 1 2 3 4 5 … 9', (page) => {
    expect(buildPageWindow(page, 9)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 9]);
  });

  it('totalPages 9, page 5 → 1 … 4 5 6 … 9', () => {
    expect(buildPageWindow(5, 9)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 9]);
  });

  it.each([6, 7, 8, 9])('totalPages 9, page %i → 1 … 5 6 7 8 9', (page) => {
    expect(buildPageWindow(page, 9)).toEqual([1, 'ellipsis', 5, 6, 7, 8, 9]);
  });

  it('totalPages 8은 가운데 분기에 걸리지 않는다 (한 칸짜리 생략이 생기지 않도록)', () => {
    expect(buildPageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 8]);
    expect(buildPageWindow(5, 8)).toEqual([1, 'ellipsis', 4, 5, 6, 7, 8]);
  });

  it('totalPages 18 표본 — page 2는 숫자를 한 칸 더 보여준다 (브리프 스케치보다 넓다)', () => {
    expect(buildPageWindow(2, 18)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 18]);
    expect(buildPageWindow(9, 18)).toEqual([1, 'ellipsis', 8, 9, 10, 'ellipsis', 18]);
    expect(buildPageWindow(15, 18)).toEqual([1, 'ellipsis', 14, 15, 16, 17, 18]);
  });

  it('totalPages > 7이면 슬롯 수가 항상 7이다 (페이지를 넘겨도 레이아웃이 요동치지 않는다)', () => {
    for (let t = 8; t <= 40; t += 1) {
      for (let page = 1; page <= t; page += 1) {
        expect(buildPageWindow(page, t)).toHaveLength(7);
      }
    }
  });
});

describe('파서 단위 — parsePageParam / parseSortParam', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['9', 9],
    ['10', 10],
    ['1234567890', 1234567890],
  ])('parsePageParam(%j) → %i', (raw, expected) => {
    expect(parsePageParam(raw)).toBe(expected);
  });

  it.each(['0', '-1', '01', '+2', '1e1', '1.5', 'abc', '', ' ', '２', ' 1', '1 ', '0x2'])(
    'parsePageParam(%j) → null (정규식 ^[1-9][0-9]*$ 불통과)',
    (raw) => {
      expect(parsePageParam(raw)).toBeNull();
    },
  );

  it('배열은 값이 하나여도 null이다 (중복 키 = 정의되지 않은 입력)', () => {
    expect(parsePageParam(['1'])).toBeNull();
    expect(parsePageParam(['2', '3'])).toBeNull();
  });

  // ⚠️ 비대칭 계약: "없음"과 "비정규형"이 둘 다 null이다.
  //    resolveListView가 undefined를 **먼저** 걸러 page=1로 삼으므로 문제가 없지만,
  //    이 함수만 따로 쓰는 호출부가 생기면 반드시 존재 여부를 먼저 봐야 한다.
  it('parsePageParam(undefined) → null — 없음과 비정규형을 구분하지 않는다', () => {
    expect(parsePageParam(undefined)).toBeNull();
    expect(resolve({})).toMatchObject({ kind: 'ok' });
  });

  it.each([
    [undefined, 'absent', 'newest'],
    ['oldest', 'valid', 'oldest'],
    ['newest', 'default', 'newest'],
    ['old', 'invalid', 'newest'],
    ['', 'invalid', 'newest'],
  ])('parseSortParam(%j) → kind %s, sort %s', (raw, kind, sort) => {
    expect(parseSortParam(raw as string | undefined)).toEqual({ kind, sort });
  });

  it('배열 sort는 invalid다 — 폴백 정렬은 언제나 기본값이다', () => {
    expect(parseSortParam(['oldest'])).toEqual({ kind: 'invalid', sort: 'newest' });
    expect(parseSortParam(['x', 'y'])).toEqual({ kind: 'invalid', sort: 'newest' });
  });
});
