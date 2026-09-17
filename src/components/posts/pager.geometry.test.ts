import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListPager } from './ListPager';
import { POSTS_PER_PAGE, buildPageWindow, type ListView } from '@/lib/posts/pagination';

/**
 * QA — 페이저 **기하 고정**(설계서 §8.2)의 회귀 가드.
 *
 * ⚠️ 확장자는 `.test.ts` (unit 프로젝트가 `src/**\/*.test.ts`만 include).
 *
 * ## 이 파일이 왜 pager.contract.test.ts와 따로 있는가
 *
 * §8.2는 "첫/마지막 페이지에서도 prev/next를 `disabled`로 렌더해 **페이저 기하를 고정**한다
 * (페이지를 넘길 때 버튼 위치가 흔들리지 않음)"를, §8.3은 "`totalPages > 7`이면 **슬롯 수가
 * 7로 고정**된다(레이아웃이 페이지마다 요동치지 않음)"를 약속한다.
 *
 * 기존 계약 테스트는 그 약속을 **슬롯 개수 7**과 **버튼 존재 여부**로만 검증한다.
 * 그런데 레이아웃을 정하는 것은 슬롯의 **개수**가 아니라 **폭**이고, 결함 A 당시 두 종류의
 * 슬롯은 폭이 달랐다 — 숫자 칩은 `TerminalChip`(`px-10 py-5` + 1px 보더), 생략은 `px-4`짜리
 * 11px `…` 한 글자였다. 따라서 "슬롯 7개"만으로는 기하가 고정되지 않는다.
 *
 * 결함 A 실측(Chromium 1280×900, `next start`, `/posts?page=N`, `getBoundingClientRect`):
 *
 *   page 1–4, 6–9 : 번호열 폭 285.2px · 버튼 행 x=336.9 w=595.1 · next 우변 932.1
 *   page 5        : 번호열 폭 267.5px · 버튼 행 x=345.8 w=577.5 · next 우변 923.2
 *
 * 4→5로 넘기면 prev가 오른쪽으로 8.9px, next가 왼쪽으로 8.9px 움직인다. 정확히
 * (숫자 칩 36.7px − 생략 19.0px) = 17.7px 만큼 번호열이 좁아진 결과다.
 *
 * 원인은 `buildPageWindow`의 가운데 분기다 — 이 분기만 생략이 **둘**이라 숫자 칩이 하나 적다:
 *
 *   page <= 4        → [1, 2, 3, 4, 5, …, t]           숫자 6 · 생략 1
 *   page >= t - 3    → [1, …, t-4, t-3, t-2, t-1, t]   숫자 6 · 생략 1
 *   그 외 (가운데)    → [1, …, p-1, p, p+1, …, t]       숫자 5 · 생략 2   ← 여기
 *
 * ## 해소 (feat-list-pagination 후속 — `ListPager`의 `SLOT_WIDTH`)
 *
 * 고친 쪽은 **폭**이지 **슬롯 구성**이 아니다. `buildPageWindow`의 가운데 분기는 §8.3의 골든 표가
 * 그대로 고정하고 있어(계약 테스트 28건) 손대면 설계가 깨진다. 대신 숫자 칩과 생략 슬롯에 같은
 * 최소 폭(`min-w-40`)과 `tabular-nums`를 줘서 **구성이 달라져도 번호 열 폭이 변하지 않게** 했다.
 *
 * 따라서 이 파일이 지키는 불변식도 "숫자 칩 수가 같다"가 아니라 **"모든 슬롯이 같은 폭 토큰을
 * 쓴다"**로 바뀌었다. 원래 `it.fails`로 고정돼 있던 결함 재현은 아래 `[고정]` 테스트로 승격됐고,
 * 숫자 칩 수가 페이지마다 다르다는 사실 자체는 결함이 아니라 **폭을 맞춰야 하는 이유**로 남는다.
 */

function makeView(input: { page: number; total: number }): ListView {
  const { page, total } = input;
  const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const start = (page - 1) * POSTS_PER_PAGE;
  return {
    page,
    totalPages,
    total,
    sort: 'newest',
    start,
    end: Math.min(start + POSTS_PER_PAGE, total),
    basePath: '/posts',
  };
}

const render = (page: number, total: number) =>
  renderToStaticMarkup(h(ListPager, { view: makeView({ page, total }) }));

/** 번호열 `<li>`를 "칩"과 "생략" 둘로 분류한다 — 폭이 다른 것은 이 둘뿐이다 */
function slotKinds(markup: string): Array<'chip' | 'ellipsis'> {
  return [...markup.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
    m[1].includes('생략된 페이지') ? 'ellipsis' : 'chip',
  );
}

/**
 * 슬롯 하나가 차지하는 폭을 결정하는 클래스 토큰을 뽑는다.
 * 생략은 `<li>`가, 숫자 칩은 `<li>` 안의 칩(`<a>`/`<span>`)이 폭을 들고 있으므로 둘 다 본다.
 * 토큰이 없으면 `'none'` — "폭을 맞추는 장치가 없다"가 곧 결함 A의 상태였다.
 */
function slotWidths(markup: string): string[] {
  const widthToken = /(?:^|\s)(min-w-\d+|w-\d+)(?=\s|$)/;
  return [...markup.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const liClass = /<li[^>]*class="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const childClass = /<(?:a|span)[^>]*class="([^"]*)"/.exec(m[1])?.[1] ?? '';
    return widthToken.exec(liClass)?.[1] ?? widthToken.exec(childClass)?.[1] ?? 'none';
  });
}

const TOTAL = 175; // 9페이지
const TOTAL_PAGES = 9;

describe('ListPager 기하 — 슬롯 개수는 이미 고정돼 있다 (기존 계약 재확인)', () => {
  it.each(Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1))(
    '%i페이지의 슬롯 수는 7이다',
    (page) => {
      expect(slotKinds(render(page, TOTAL))).toHaveLength(7);
    },
  );

  it.each(Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1))(
    '%i페이지에서 prev/next가 둘 다 렌더된다 (사라져서 번호열이 밀리지 않는다)',
    (page) => {
      const markup = render(page, TOTAL);
      expect(markup).toContain('--prev');
      expect(markup).toContain('--next');
    },
  );
});

describe('ListPager 기하 — 슬롯 종류가 달라도 폭은 같다 (§8.2 이행)', () => {
  it('숫자 칩과 생략 슬롯이 같은 최소 폭 토큰을 쓴다 (조판은 그대로, 차지하는 폭만 같다)', () => {
    const markup = render(5, TOTAL);
    const chip = /<li[^>]*><a[^>]*class="([^"]*)"/.exec(markup)?.[1] ?? '';
    const ellipsisLi = /<li class="([^"]*)"><span aria-hidden/.exec(markup)?.[1] ?? '';
    // 조판(패딩·보더·글자 크기)은 손대지 않았다 — 레트로 CRT 칩은 그대로다
    expect(chip).toContain('px-10');
    // 폭만 맞춘다: 칩 36.7px < 40px, 생략 19.0px < 40px → 둘 다 정확히 40px가 된다
    expect(chip).toContain('min-w-40');
    expect(ellipsisLi).toContain('min-w-40');
    // 비례폭 글꼴의 자릿수 흔들림(01=34.8px vs 04=36.7px)은 tabular-nums가 잡는다
    expect(chip).toContain('tabular-nums');
  });

  /**
   * ★ 결함 A의 회귀 가드 (원래 `it.fails`였다). 이 단언이 통과하는 동안 §8.2의
   *   "페이저 기하 고정"이 실제로 성립한다 — 모든 슬롯이 같은 폭이므로 번호 열 폭은
   *   슬롯 **구성**과 무관하게 `7 × 40px + 6 × gap-8`로 일정하고, prev/next가 밀리지 않는다.
   */
  it('[고정] totalPages > 7의 모든 페이지에서 슬롯 폭 구성이 동일하다', () => {
    const perPage = Array.from({ length: TOTAL_PAGES }, (_, i) =>
      slotWidths(render(i + 1, TOTAL)),
    );
    // ① 한 페이지 안에서 슬롯 7개가 모두 같은 폭
    for (const widths of perPage) {
      expect(widths).toHaveLength(7);
      expect(new Set(widths)).toEqual(new Set(['min-w-40']));
    }
    // ② 페이지가 바뀌어도 번호 열의 폭 구성이 그대로 (4↔5페이지가 결함의 진앙이었다)
    expect(new Set(perPage.map((w) => w.join(' '))).size).toBe(1);
  });

  // 아래 셋은 폭을 맞춰야 했던 **이유**(슬롯 구성이 페이지마다 다르다)를 고정한다.
  // 구성 자체는 §8.3 골든 그대로이고 결함이 아니다 — 폭 장치가 사라지면 다시 결함이 된다.
  it('슬롯 구성의 정확한 모양 — 가운데 분기(5페이지)만 숫자 5 · 생략 2다', () => {
    const counts = Array.from({ length: TOTAL_PAGES }, (_, i) => {
      const kinds = slotKinds(render(i + 1, TOTAL));
      return {
        page: i + 1,
        chips: kinds.filter((k) => k === 'chip').length,
        ellipses: kinds.filter((k) => k === 'ellipsis').length,
      };
    });
    expect(counts.filter((c) => c.chips === 5).map((c) => c.page)).toEqual([5]);
    expect(counts.filter((c) => c.chips === 6).map((c) => c.page)).toEqual([
      1, 2, 3, 4, 6, 7, 8, 9,
    ]);
  });

  it('가운데 분기는 totalPages >= 9인 모든 목록에서 생긴다 — 9페이지짜리 예외가 아니다', () => {
    const offenders: number[] = [];
    for (let t = 8; t <= 40; t++) {
      const chipCounts = new Set(
        Array.from({ length: t }, (_, i) =>
          buildPageWindow(i + 1, t).filter((s) => s !== 'ellipsis').length,
        ),
      );
      if (chipCounts.size > 1) offenders.push(t);
    }
    expect(offenders[0]).toBe(9);
    expect(offenders).toEqual(Array.from({ length: 40 - 9 + 1 }, (_, i) => i + 9));
  });

  it('totalPages 8 이하는 영향이 없다 (가운데 분기가 존재하지 않는다)', () => {
    for (let t = 1; t <= 8; t++) {
      const chipCounts = new Set(
        Array.from({ length: t }, (_, i) =>
          buildPageWindow(i + 1, t).filter((s) => s !== 'ellipsis').length,
        ),
      );
      expect(chipCounts.size).toBe(1);
    }
  });
});
