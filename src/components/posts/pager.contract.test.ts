import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListPager } from './ListPager';
import {
  POSTS_PER_PAGE,
  buildListHref,
  buildPageWindow,
  type ListSort,
  type ListView,
} from '@/lib/posts/pagination';
import { tagHref } from '@/lib/routes';

/**
 * QA 계약 테스트 — 페이저 렌더 (feat-list-pagination 설계서 §8.2–8.3 / §14.2).
 *
 * ⚠️ 확장자는 반드시 `.test.ts` 다. vitest.config.ts의 unit 프로젝트가
 *    `src/**\/*.test.ts`만 include하므로 `.test.tsx`는 실패 없이 조용히 미실행된다.
 *    그래서 JSX 대신 React.createElement + renderToStaticMarkup(node 환경)을 쓴다
 *    (primitives.contract.test.ts 상단 경고와 동일).
 *
 * 이 파일이 막는 것 — 페이저에는 타입으로 잡히지 않는 조용한 회귀가 셋 있다:
 *   ① prev/next를 "첫 페이지니까 숨기자"로 되돌리면 번호 열이 좌우로 밀려 페이저 기하가 흔들린다.
 *      사라진 버튼은 화면을 봐야 알 수 있고 테스트가 없으면 아무도 모른다.
 *   ② href를 문자열로 직접 조립하면 기본값 생략 규칙(page=1·sort=newest 미표기)이 이중화된다.
 *      틀린 URL이 아니라 **중복된 URL**이 생기는 거라 눈에 띄지 않는다 → 전수 문자열 비교로 고정.
 *   ③ 현재 페이지를 링크로 만들면 자기 자신으로 가는 <a>가 생기고 aria-current의 유일성이 깨진다.
 *   ④ prev/next에 `aria-label`을 되돌리면 가시 라벨(`$ ls --prev`)이 accessible name에서 통째로
 *      사라진다 (WCAG 2.5.3 Label in Name 위반 — 음성 제어로 "ls --prev"라고 말해도 안 잡힌다).
 *      화면상 아무 변화가 없어 육안으로는 절대 발견되지 않으므로, 아래 label-in-name 불변식이
 *      이 파일에서 유일한 방어선이다. `SortToggle`의 srHint 방침과 같은 계약.
 */

/** 확정 뷰 조립 — resolveListView가 보증하는 불변식을 그대로 재현한다 (start/end/totalPages) */
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

const render = (input: Parameters<typeof makeView>[0]) =>
  renderToStaticMarkup(h(ListPager, { view: makeView(input) }));

/** HTML 속성은 `&`가 `&amp;`로 이스케이프돼 나온다 — 원래 URL로 되돌려 비교한다 */
const hrefsOf = (markup: string): string[] =>
  [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));

/** 페이저가 쓰는 폭별 축약은 두 갈래뿐이다 — `max-md:hidden`(모바일에서 숨김) / `hidden max-md:inline`(데스크톱에서 숨김) */
type Viewport = 'desktop' | 'mobile';

/** 그 폭에서 이 클래스 조합이 display:none인가. `sr-only`는 "눈에만 안 보임"이라 여기 해당하지 않는다 */
function isDisplayNoneAt(className: string, viewport: Viewport): boolean {
  const classes = className.split(/\s+/);
  if (viewport === 'mobile') {
    return (
      classes.includes('max-md:hidden') ||
      (classes.includes('hidden') && !classes.includes('max-md:inline'))
    );
  }
  return classes.includes('hidden');
}

/** prev/next 버튼 한 덩이(<a>…</a> 또는 <button>…</button>)를 라벨 마커로 찾아 잘라낸다 */
function pagerButton(markup: string, marker: '--prev' | '--next'): string {
  for (const el of markup.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (el[2].includes(marker)) return el[0];
  }
  throw new Error(`${marker} 버튼을 찾지 못했다`);
}

/**
 * 자식 span을 순회해 텍스트를 잇는다. `display:none`(폭별 축약)과 `aria-hidden`은
 * 접근성 트리에서도 화면에서도 빠지고, `sr-only`만 두 결과가 갈리는 지점이다.
 * (페이저가 쓰는 **평평한 span 목록**에 한정한 근사 — 브라우저 accname 알고리즘 전부는 아니다.
 *  두 결과를 같은 규칙으로 잇기 때문에 아래 포함 관계 판정은 유효하다.)
 */
function collectText(element: string, viewport: Viewport, withSrOnly: boolean): string {
  const inner = element.replace(/^<(a|button)\b[^>]*>/, '').replace(/<\/(a|button)>$/, '');
  const parts: string[] = [];
  for (const span of inner.matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/g)) {
    const className = /class="([^"]*)"/.exec(span[1])?.[1] ?? '';
    if (span[1].includes('aria-hidden="true"')) continue;
    if (isDisplayNoneAt(className, viewport)) continue;
    if (className.split(/\s+/).includes('sr-only') && !withSrOnly) continue;
    parts.push(span[2]);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** 그 폭에서 **화면에 실제로 보이는** 텍스트 (sr-only 제외) — 음성 제어 사용자가 소리내어 읽는 그것 */
const visibleText = (element: string, viewport: Viewport) => collectText(element, viewport, false);

/**
 * accessible name 계산의 최소 모델.
 * ★ `aria-label`이 있으면 **내용을 통째로 덮는다**(accname 우선순위). 가시 라벨이 이름에서
 *   사라지는 지점이 정확히 여기라, 이 두 줄이 label-in-name 불변식의 심장이다 —
 *   누가 aria-label을 되돌리면 이름이 라벨을 잃고 아래 포함 단언이 깨진다.
 */
function accessibleName(element: string, viewport: Viewport): string {
  const ariaLabel = /^<(?:a|button)\b[^>]*\saria-label="([^"]*)"/.exec(element)?.[1];
  if (ariaLabel !== undefined) return ariaLabel;
  return collectText(element, viewport, true);
}

/** 175편 = 9페이지. 설계서 전반의 기준 수치 */
const TOTAL = 175;
const TOTAL_PAGES = 9;

describe('ListPager — 렌더 여부', () => {
  it('totalPages <= 1 이면 아무것도 렌더하지 않는다 (기존 LoadMore의 total <= PAGE_SIZE → null과 같은 자리)', () => {
    expect(render({ page: 1, total: 0 })).toBe('');
    expect(render({ page: 1, total: 1 })).toBe('');
    expect(render({ page: 1, total: POSTS_PER_PAGE })).toBe('');
  });

  it('페이지가 둘 이상이면 렌더한다 (경계는 POSTS_PER_PAGE + 1)', () => {
    expect(render({ page: 1, total: POSTS_PER_PAGE + 1 })).not.toBe('');
  });

  it('<nav aria-label="페이지 매김">으로 감싼다', () => {
    expect(render({ page: 2, total: TOTAL })).toContain('<nav aria-label="페이지 매김"');
  });
});

describe('ListPager — prev/next는 사라지지 않는다 (페이저 기하 고정)', () => {
  // ★ 핵심 회귀 지점: 첫/마지막 페이지에서 버튼을 숨기면 번호 열이 좌우로 흔들린다
  it.each(Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1))(
    '%i페이지에서도 --prev와 --next가 둘 다 존재한다',
    (page) => {
      const markup = render({ page, total: TOTAL });
      expect(markup).toContain('ls --prev');
      expect(markup).toContain('ls --next');
    },
  );

  it('첫 페이지의 prev는 <button disabled>이고 링크가 아니다', () => {
    const markup = render({ page: 1, total: TOTAL });
    const prev = markup.slice(0, markup.indexOf('ls --prev'));
    expect(prev).toContain('<button');
    expect(prev).toContain('disabled');
    // prev 자리에 <a>가 없어야 한다 — 존재하지 않는 0페이지로 가는 링크 금지
    expect(prev).not.toContain('<a ');
    expect(hrefsOf(markup)).not.toContain('/posts?page=0');
  });

  it('마지막 페이지의 next는 <button disabled>이다', () => {
    const markup = render({ page: TOTAL_PAGES, total: TOTAL });
    const next = markup.slice(markup.indexOf('ls --next') - 300, markup.indexOf('ls --next'));
    expect(next).toContain('<button');
    expect(next).toContain('disabled');
    expect(hrefsOf(markup)).not.toContain(`/posts?page=${TOTAL_PAGES + 1}`);
  });

  it('중간 페이지에서는 prev/next가 둘 다 링크다 (disabled 없음)', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).not.toContain('disabled');
    expect(hrefsOf(markup)).toEqual(expect.arrayContaining(['/posts?page=4', '/posts?page=6']));
  });

  it('비활성 버튼은 pointer-events-none을 유지한다 (TerminalButton의 기존 disabled 분기)', () => {
    expect(render({ page: 1, total: TOTAL })).toContain('pointer-events-none');
  });

  it('prev/next의 위치는 라벨 뒤에 덧붙는 sr-only 힌트로 준다 (라벨을 덮는 aria-label이 아니다)', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<span class="sr-only"> 이전 페이지 (4/9)</span>');
    expect(markup).toContain('<span class="sr-only"> 다음 페이지 (6/9)</span>');
  });

  it('모바일에서는 `ls ` 없이 --prev/--next만 보인다 (SortToggle shortLabel과 같은 기법)', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<span class="max-md:hidden">ls --prev</span>');
    expect(markup).toContain('<span class="hidden max-md:inline">--prev</span>');
    expect(markup).toContain('<span class="hidden max-md:inline">--next</span>');
  });
});

/** [폭, 페이지] 전수 — 두 축약 폭 어느 쪽에서도 불변식이 성립해야 한다 */
const LABEL_IN_NAME_CASES: [Viewport, number][] = (['desktop', 'mobile'] as Viewport[]).flatMap(
  (viewport) => Array.from({ length: TOTAL_PAGES }, (_, i): [Viewport, number] => [viewport, i + 1]),
);

describe('ListPager — accessible name이 가시 라벨을 포함한다 (WCAG 2.5.3 label-in-name)', () => {
  // ★ 핵심 회귀 지점: aria-label은 이름을 **덮는다**. 화면은 그대로라 육안으로 잡히지 않고,
  //   음성 제어 사용자만 "ls --prev"가 통하지 않는 것으로 뒤늦게 발견한다.
  it.each(LABEL_IN_NAME_CASES)(
    '%s / %i페이지 — prev·next 모두 가시 텍스트가 accessible name에 그대로 들어있다',
    (viewport, page) => {
      const markup = render({ page, total: TOTAL });
      for (const marker of ['--prev', '--next'] as const) {
        const element = pagerButton(markup, marker);
        const visible = visibleText(element, viewport);
        const accName = accessibleName(element, viewport);
        // 그 폭에서 보이는 라벨이 실제로 있다 (축약 분기가 통째로 사라지면 포함 관계가 공허해진다)
        expect(visible).toContain(marker);
        expect(accName).toContain(visible);
      }
    },
  );

  it('prev/next에는 aria-label이 없다 — 문서의 aria-label은 nav 랜드마크 이름 하나뿐이다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(pagerButton(markup, '--prev')).not.toContain('aria-label');
    expect(pagerButton(markup, '--next')).not.toContain('aria-label');
    // 랜드마크 이름은 label-in-name 대상이 아니므로 유지한다 (가시 라벨이 없는 요소)
    expect([...markup.matchAll(/aria-label=/g)]).toHaveLength(1);
    expect(markup).toContain('<nav aria-label="페이지 매김"');
  });

  it('활성 prev/next의 sr-only 힌트는 이동할 페이지 번호를 준다 (전수)', () => {
    for (let page = 1; page <= TOTAL_PAGES; page += 1) {
      const markup = render({ page, total: TOTAL });
      if (page > 1) {
        expect(accessibleName(pagerButton(markup, '--prev'), 'desktop')).toBe(
          `$ ls --prev 이전 페이지 (${page - 1}/${TOTAL_PAGES})`,
        );
      }
      if (page < TOTAL_PAGES) {
        expect(accessibleName(pagerButton(markup, '--next'), 'desktop')).toBe(
          `$ ls --next 다음 페이지 (${page + 1}/${TOTAL_PAGES})`,
        );
      }
    }
  });

  it('비활성 prev/next는 존재하지 않는 페이지를 읽지 않는다 (첫 페이지 prev에 `(0/9)` 금지)', () => {
    const firstPrev = pagerButton(render({ page: 1, total: TOTAL }), '--prev');
    expect(accessibleName(firstPrev, 'desktop')).toBe('$ ls --prev 이전 페이지');
    expect(firstPrev).not.toMatch(/\(\d+\/\d+\)/);

    const lastNext = pagerButton(render({ page: TOTAL_PAGES, total: TOTAL }), '--next');
    expect(accessibleName(lastNext, 'desktop')).toBe('$ ls --next 다음 페이지');
    expect(lastNext).not.toMatch(/\(\d+\/\d+\)/);
  });

  it('sr-only 힌트는 화면에 아무것도 더하지 않는다 — 가시 텍스트는 §8.2 조판 그대로다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(visibleText(pagerButton(markup, '--prev'), 'desktop')).toBe('$ ls --prev');
    expect(visibleText(pagerButton(markup, '--next'), 'desktop')).toBe('$ ls --next');
    // 모바일 축약에서도 마찬가지 — `ls `만 빠진다
    expect(visibleText(pagerButton(markup, '--prev'), 'mobile')).toBe('$ --prev');
    expect(visibleText(pagerButton(markup, '--next'), 'mobile')).toBe('$ --next');
  });
});

describe('ListPager — 페이지 번호 칩', () => {
  it('현재 페이지 칩은 aria-current="page"를 갖고 링크가 아니다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<span aria-current="page"');
    expect(markup).toContain('>05</span>');
    // aria-current는 문서 내 정확히 하나
    expect([...markup.matchAll(/aria-current/g)]).toHaveLength(1);
    // 현재 페이지로 가는 링크가 없다 (자기 자신 <a> 금지)
    expect(hrefsOf(markup)).not.toContain('/posts?page=5');
  });

  it('현재 페이지 칩은 filled variant다 (역상 accent)', () => {
    expect(render({ page: 5, total: TOTAL })).toContain('bg-accent');
  });

  it('번호는 2자리 0채움이다 — PostRow 인덱스와 같은 조판 규칙', () => {
    const markup = render({ page: 5, total: TOTAL });
    for (const n of ['01', '04', '05', '06', '09']) {
      expect(markup).toContain(`>${n}<`);
    }
    expect(markup).not.toContain('>5<');
  });

  it('buildPageWindow가 내놓은 슬롯만 렌더한다 (total=9 전수)', () => {
    for (let page = 1; page <= TOTAL_PAGES; page += 1) {
      const markup = render({ page, total: TOTAL });
      const numbers = buildPageWindow(page, TOTAL_PAGES).filter(
        (slot): slot is number => slot !== 'ellipsis',
      );
      const rendered = [...markup.matchAll(/>(\d{2})</g)].map((m) => Number(m[1]));
      expect(rendered).toEqual(numbers);
    }
  });

  it('생략 슬롯은 aria-hidden된 …와 sr-only 설명을 함께 갖는다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<span aria-hidden="true" class="text-[11px] text-text-faint">…</span>');
    expect(markup).toContain('<span class="sr-only">생략된 페이지</span>');
    // page 5/9 → [1, …, 4, 5, 6, …, 9] 로 생략이 둘
    expect([...markup.matchAll(/생략된 페이지/g)]).toHaveLength(2);
  });

  it('번호 열은 모바일에서 숨고 `05 / 09` 한 덩이로 대체된다 (320px에 칩 7개는 안 들어간다)', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<ol class="flex items-center gap-8 max-md:hidden">');
    expect(markup).toContain('05 / 09');
  });

  it('모바일 위치 표기에는 "페이지" 맥락이 붙는다 — 맨몸 `05 / 09`는 "05 슬래시 09"로만 읽힌다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).toContain('<span class="sr-only">페이지 </span>05 / 09');
    // 맥락은 sr-only로만 — 시각적으로는 `05 / 09` 그대로여야 한다 (§8.2 조판 불변)
    expect(markup).not.toContain('>페이지 05');
  });
});

describe('ListPager — href는 buildListHref만이 조립한다', () => {
  /** 해당 페이지에서 나와야 하는 href 전집합 — 페이저 구현과 독립적으로 정본 함수로만 계산한다 */
  const expectedHrefs = (page: number, totalPages: number, sort: ListSort, basePath: string) => {
    const hrefs: string[] = [];
    if (page > 1) hrefs.push(buildListHref(basePath, { page: page - 1, sort }));
    for (const slot of buildPageWindow(page, totalPages)) {
      if (slot !== 'ellipsis' && slot !== page) {
        hrefs.push(buildListHref(basePath, { page: slot, sort }));
      }
    }
    if (page < totalPages) hrefs.push(buildListHref(basePath, { page: page + 1, sort }));
    return hrefs;
  };

  // ★ 핵심 회귀 지점: 조립 로직이 이중화되면 "틀린 URL"이 아니라 "중복된 URL"이 생겨 눈에 띄지 않는다
  it.each([
    ['/posts', 'newest' as ListSort],
    ['/posts', 'oldest' as ListSort],
    ['/', 'newest' as ListSort],
    ['/categories/backend', 'oldest' as ListSort],
  ])('%s (%s) — 모든 페이지의 href가 buildListHref 출력과 문자열까지 일치한다', (basePath, sort) => {
    for (let page = 1; page <= TOTAL_PAGES; page += 1) {
      const markup = render({ page, total: TOTAL, sort, basePath });
      expect(hrefsOf(markup)).toEqual(expectedHrefs(page, TOTAL_PAGES, sort, basePath));
    }
  });

  it('기본값은 어떤 href에도 실리지 않는다 (page=1 / sort=newest 미표기, §3.2)', () => {
    for (const sort of ['newest', 'oldest'] as ListSort[]) {
      for (let page = 1; page <= TOTAL_PAGES; page += 1) {
        for (const href of hrefsOf(render({ page, total: TOTAL, sort }))) {
          expect(href).not.toContain('page=1&');
          expect(href).not.toMatch(/page=1$/);
          expect(href).not.toContain('sort=newest');
        }
      }
    }
  });

  it('1페이지로 돌아가는 링크는 쿼리 없는 basePath다', () => {
    expect(hrefsOf(render({ page: 2, total: TOTAL }))).toContain('/posts');
    expect(hrefsOf(render({ page: 2, total: TOTAL, basePath: '/' }))).toContain('/');
  });

  it('정렬을 그대로 이어간다 — 페이지 이동이 정렬을 떨어뜨리지 않는다', () => {
    const markup = render({ page: 2, total: TOTAL, sort: 'oldest' });
    expect(hrefsOf(markup)).toContain('/posts?page=3&sort=oldest');
    expect(hrefsOf(markup)).toContain('/posts?sort=oldest'); // 1페이지
  });

  it('홈(basePath="/")의 2페이지 링크는 /?page=2 다', () => {
    expect(hrefsOf(render({ page: 1, total: TOTAL, basePath: '/' }))).toContain('/?page=2');
  });

  // 인코딩된 태그 경로에 쿼리만 덧붙는다 — routes.contract.test.ts가 막는 세그먼트 탈출이 페이저에서 재현되지 않게
  it('태그 basePath는 경로 세그먼트를 늘리지 않는다 (tagHref 결과를 그대로 신뢰)', () => {
    const basePath = tagHref('React 렌더링');
    for (const href of hrefsOf(render({ page: 2, total: TOTAL, basePath }))) {
      expect(href.startsWith('/tags/')).toBe(true);
      expect(href.split('?')[0].split('/')).toHaveLength(3); // ['', 'tags', '<segment>']
    }
  });
});

describe('ListPager — 위치 텍스트와 진행 바', () => {
  it('`{start+1} – {end} / {total} 표시 중` 문형을 유지한다', () => {
    expect(render({ page: 5, total: TOTAL })).toContain('81 – 100 / 175 표시 중');
    // 마지막 페이지는 20건 미만
    expect(render({ page: 9, total: TOTAL })).toContain('161 – 175 / 175 표시 중');
  });

  // ★ 진행 바의 의미가 "로드 진행률"에서 "페이지 위치"로 바뀌었다 — progressbar 롤은 제거된다
  it('진행 바는 aria-hidden이고 role="progressbar"를 쓰지 않는다', () => {
    const markup = render({ page: 5, total: TOTAL });
    expect(markup).not.toContain('progressbar');
    expect(markup).not.toContain('aria-valuenow');
    expect(markup).toContain('<div aria-hidden="true" class="h-4 w-240 max-w-full bg-track">');
  });

  it('진행 바 폭은 페이지 위치 비율이고 마지막 페이지에서 100%가 된다', () => {
    expect(render({ page: 9, total: TOTAL })).toContain('width:100%');
    expect(render({ page: 1, total: TOTAL })).toContain(`width:${(1 / 9) * 100}%`);
  });
});
