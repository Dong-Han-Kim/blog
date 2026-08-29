import { createElement as h, type FC, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ArchiveHeader } from './ArchiveHeader';
import { ErrorLine } from './ErrorLine';
import { ErrorScreen } from './ErrorScreen';
import { IndexPageShell } from './IndexPageShell';
import { CategoryBadge } from '@/components/terminal/CategoryBadge';
import { TerminalChip } from '@/components/terminal/TerminalChip';
import { cn } from '@/lib/utils';

/**
 * QA 계약 테스트 — 트랙 D에서 새로 추출된 UI 프리미티브의 렌더 결과.
 *
 * ⚠️ 확장자는 반드시 `.test.ts` 다. vitest.config.ts의 unit 프로젝트가
 *    `src/**\/*.test.ts`만 include하므로 `.test.tsx`는 실패 없이 조용히 미실행된다.
 *    그래서 JSX 대신 React.createElement + renderToStaticMarkup(node 환경)을 쓴다.
 *
 * 이 파일이 막는 것: 추출된 프리미티브 4종은 이번 브랜치에서 신설됐고 단위 테스트가
 * 0건이었다. 특히 `cn`(tailwind-merge)을 통과하는 클래스 문자열은 **토큰 하나만 바꿔도
 * 다른 클래스가 조용히 삭제**되므로(폰트 크기 토큰이 색상으로 오인되는 알려진 문제),
 * 최종 렌더 클래스 자체를 계약으로 고정한다.
 */

/**
 * children이 required인 컴포넌트를 createElement의 3번째 인자로 넘기기 위한 타입 완화.
 * 런타임 래핑이 없는 순수 타입 캐스트라 렌더 대상은 원본 컴포넌트 그대로다.
 */
// eslint-disable-next-line no-unused-vars -- 타입 시그니처의 파라미터명
type LooseChildren<T extends (props: never) => unknown> = Omit<
  Parameters<T>[0],
  'children'
> & { children?: ReactNode };
const Chip = TerminalChip as unknown as FC<LooseChildren<typeof TerminalChip>>;
const Shell = IndexPageShell as unknown as FC<LooseChildren<typeof IndexPageShell>>;

const classesOf = (markup: string, index = 0): string[] => {
  const matches = [...markup.matchAll(/class="([^"]*)"/g)];
  return (matches[index]?.[1] ?? '').split(' ').filter(Boolean);
};

describe('TerminalChip — 렌더 분기와 클래스 계약 (D-2 / C1-b)', () => {
  it('href를 주면 <a>로, onClick을 주면 <button type="button">로, 둘 다 없으면 <span>으로 렌더한다', () => {
    expect(renderToStaticMarkup(h(Chip, { href: '/tags/linux' }, 'x'))).toContain(
      '<a ',
    );
    expect(renderToStaticMarkup(h(Chip, { onClick: () => {} }, 'x'))).toContain(
      '<button type="button"',
    );
    expect(renderToStaticMarkup(h(Chip, {}, 'x'))).toContain('<span');
  });

  it('href가 onClick보다 우선한다 (동시 지정은 계약 위반이지만 분기는 결정적이어야 한다)', () => {
    const markup = renderToStaticMarkup(
      h(Chip, { href: '/tags/x', onClick: () => {} }, 'x'),
    );
    expect(markup).toContain('<a ');
    expect(markup).not.toContain('<button');
  });

  it('href를 인코딩하거나 재가공하지 않고 그대로 넘긴다 (tagHref 결과를 신뢰)', () => {
    const markup = renderToStaticMarkup(
      h(Chip, { href: '/tags/%EB%A6%AC%EB%88%85%EC%8A%A4' }, 'x'),
    );
    expect(markup).toContain('href="/tags/%EB%A6%AC%EB%88%85%EC%8A%A4"');
  });

  // ★ 핵심 회귀 지점: text-[11px]가 뒤따르는 text-* 색상 클래스에 먹히면 안 된다.
  //   `text-[11px]`를 명명 토큰(text-meta 등)으로 바꾸는 순간 tailwind-merge가
  //   이를 색상으로 오인해 삭제하고 칩 글자 크기가 상속값으로 튄다.
  it('outline 칩의 최종 클래스가 고정된다 — text-[11px]가 색상 클래스에 삭제되지 않는다', () => {
    const classes = classesOf(renderToStaticMarkup(h(Chip, {}, 'x')));
    expect(classes).toEqual([
      'inline-block',
      'px-10',
      'py-5',
      'text-[11px]',
      'border',
      'border-text-faint',
      'text-text-muted',
      'hover:border-accent',
      'hover:text-text-strong',
    ]);
  });

  it('filled 칩은 투명 보더로 outline과 같은 보더 박스 높이를 유지한다 (D-2.6)', () => {
    const classes = classesOf(
      renderToStaticMarkup(h(Chip, { variant: 'filled' }, 'x')),
    );
    expect(classes).toEqual([
      'inline-block',
      'px-10',
      'py-5',
      'text-[11px]',
      'border',
      'border-transparent',
      'bg-accent',
      'text-bg',
    ]);
    // 보더 유틸리티가 빠지면 형제 칩과 2px 어긋난다
    expect(classes).toContain('border');
    expect(classes).toContain('text-[11px]');
  });

  it('두 variant의 패딩·크기 축이 동일하다 (패딩 분화 px-9 py-4 재발 방지)', () => {
    const outline = classesOf(renderToStaticMarkup(h(Chip, {}, 'x')));
    const filled = classesOf(renderToStaticMarkup(h(Chip, { variant: 'filled' }, 'x')));
    for (const c of ['px-10', 'py-5', 'text-[11px]', 'inline-block']) {
      expect(outline).toContain(c);
      expect(filled).toContain(c);
    }
    expect(outline).not.toContain('px-9');
    expect(outline).not.toContain('py-4');
  });

  it('className은 base 뒤에 병합돼 display를 덮을 수 있다 (CommentItem 스레드 토글)', () => {
    const classes = classesOf(
      renderToStaticMarkup(
        h(
          Chip,
          { onClick: () => {}, className: 'mt-14 inline-flex items-center gap-8' },
          'x',
        ),
      ),
    );
    expect(classes).toContain('inline-flex');
    expect(classes).not.toContain('inline-block'); // twMerge가 display를 단일화
    expect(classes).toContain('text-[11px]'); // 크기·색은 소비처가 덮지 못한다
    expect(classes).toContain('text-text-muted');
    expect(classes).toContain('mt-14');
  });

  it('ariaCurrent는 span 분기에서만 aria-current 속성이 된다', () => {
    expect(
      renderToStaticMarkup(h(Chip, { ariaCurrent: 'page' }, 'x')),
    ).toContain('aria-current="page"');
    expect(renderToStaticMarkup(h(Chip, {}, 'x'))).not.toContain('aria-current');
  });

  it('children을 그대로 렌더한다 (태그명과 카운트 사이 공백 보존)', () => {
    const markup = renderToStaticMarkup(
      h(Chip, { href: '/tags/Linux' }, '#Linux ', h('span', null, '4')),
    );
    expect(markup).toContain('#Linux <span>4</span>');
  });

  it("'use client' 없이 서버에서 렌더된다 (정적 페이지 JS 페이로드 불변, D-2.2)", () => {
    // 클라이언트 지시어가 붙으면 이 import 자체가 서버 렌더에서 다르게 동작한다.
    // 여기서 렌더가 성공한다는 사실이 서버 컴포넌트임의 실증이다.
    expect(() => renderToStaticMarkup(h(Chip, { href: '/x' }, 'x'))).not.toThrow();
  });
});

describe('ArchiveHeader — 카테고리/태그 상세 공통 헤더 (D-4 / C4)', () => {
  const tagProps = {
    title: '#Linux',
    titleClassName: 'text-[40px] leading-[1.3]',
    description: '이 태그가 달린 글',
    entryCount: 4,
    path: 'tags/linux/',
  };

  it('여백이 mb-44로 수렴한다 (D-2 축① — 인덱스 4곳과 일치)', () => {
    const markup = renderToStaticMarkup(h(ArchiveHeader, tagProps));
    expect(classesOf(markup, 0)).toEqual([
      'mb-44',
      'flex',
      'items-end',
      'justify-between',
      'gap-32',
    ]);
    expect(markup).not.toContain('mb-40');
  });

  it('설명문이 text-[13px]로 수렴한다 (D-2 축③)', () => {
    const markup = renderToStaticMarkup(h(ArchiveHeader, tagProps));
    expect(markup).toContain(
      '<p class="mt-12 text-[13px] leading-[2] text-text-muted">이 태그가 달린 글</p>',
    );
    expect(markup).not.toContain('text-[12px]');
  });

  it('description이 없으면 <p> 노드를 만들지 않는다 (D-4.4)', () => {
    const markup = renderToStaticMarkup(
      h(ArchiveHeader, { ...tagProps, description: undefined }),
    );
    expect(markup).not.toContain('<p');
    expect(markup).toContain('<h1');
  });

  it('빈 문자열 description도 <p>를 만들지 않는다', () => {
    expect(renderToStaticMarkup(h(ArchiveHeader, { ...tagProps, description: '' }))).not.toContain(
      '<p',
    );
  });

  // ★ 핵심 회귀 지점: h1 클래스를 cn()으로 바꾸면 tailwind-merge가 명명 폰트 크기 토큰
  //   `text-cat-title`을 색상으로 오인해 `text-text-strong`을 삭제한다 (카테고리 h1 색 회귀).
  //   문자열 이어붙이기가 의도이며, 이 테스트가 그 의도를 고정한다.
  it('카테고리 h1은 text-cat-title과 text-text-strong을 동시에 유지한다 (색 회귀 방지)', () => {
    const markup = renderToStaticMarkup(
      h(ArchiveHeader, {
        title: 'DEVOPS',
        titleClassName: 'text-cat-title uppercase',
        entryCount: 1,
        path: 'categories/devops/',
      }),
    );
    expect(markup).toContain(
      '<h1 class="font-display text-text-strong text-cat-title uppercase">',
    );
    // cn을 쓰면 사라지는 클래스임을 실증 — 이 대비가 깨지면 위 단언의 의미도 사라진다
    expect(cn('font-display text-text-strong', 'text-cat-title uppercase')).not.toContain(
      'text-text-strong',
    );
  });

  it('태그 h1은 40px 분기를 그대로 유지한다 (uppercase를 붙이지 않는다, D-2 축②)', () => {
    const markup = renderToStaticMarkup(h(ArchiveHeader, tagProps));
    expect(markup).toContain(
      '<h1 class="font-display text-text-strong text-[40px] leading-[1.3]">#Linux</h1>',
    );
    expect(markup).not.toContain('uppercase');
  });

  it('entryCount와 path가 우측 메타에 그대로 들어간다', () => {
    const markup = renderToStaticMarkup(h(ArchiveHeader, { ...tagProps, entryCount: 0 }));
    expect(markup).toContain('<div>0 ENTRIES</div>');
    expect(markup).toContain('<div class="text-text-faint">tags/linux/</div>');
  });

  it('title에 ReactNode를 넣어도 렌더된다 (태그 상세는 #{name} 조합)', () => {
    const markup = renderToStaticMarkup(
      h(ArchiveHeader, { ...tagProps, title: h('span', null, '#리눅스') }),
    );
    expect(markup).toContain('<span>#리눅스</span>');
  });

  it('h1은 정확히 1개다 (문서 내 h1 유일성)', () => {
    const markup = renderToStaticMarkup(h(ArchiveHeader, tagProps));
    expect([...markup.matchAll(/<h1/g)]).toHaveLength(1);
  });
});

describe('IndexPageShell — 인덱스 페이지 공통 셸 (D-3 / C2)', () => {
  const render = () =>
    renderToStaticMarkup(
      h(Shell, { command: 'ls tags/', title: '태그' }, h('div', { id: 'kids' }, 'X')),
    );

  it('PromptLine·h1·children·FooterPrompt 순서가 고정된다', () => {
    const markup = render();
    const iPrompt = markup.indexOf('ls tags/');
    const iH1 = markup.indexOf('<h1');
    const iKids = markup.indexOf('id="kids"');
    const iFooter = markup.indexOf('cd ..');
    expect(iPrompt).toBeGreaterThanOrEqual(0);
    expect(iH1).toBeGreaterThan(iPrompt);
    expect(iKids).toBeGreaterThan(iH1);
    expect(iFooter).toBeGreaterThan(iKids);
  });

  it('h1 클래스와 여백이 고정된다 (mb-44 wordmark)', () => {
    expect(render()).toContain(
      '<h1 class="mb-44 font-display text-wordmark text-text-strong max-md:text-[19px]">태그</h1>',
    );
  });

  it('상단 프롬프트 여백은 mt-40 mb-26이다 (상세 페이지의 mt-44와 다르다)', () => {
    expect(render()).toContain('mt-40 mb-26');
    expect(render()).not.toContain('mt-44');
  });

  it('푸터 프롬프트는 cd .. + 커서 + mt-48로 4곳이 동일하다 (D-3.4)', () => {
    const markup = render();
    expect(markup).toContain('cd ..');
    expect(markup).toContain('mt-48');
    expect(markup).toContain('animate-blink');
  });

  it('h1은 정확히 1개다 — 셸이 문서 내 유일 h1 계약을 보증한다 (D-3.I4)', () => {
    expect([...render().matchAll(/<h1/g)]).toHaveLength(1);
  });

  it('command와 title은 통일되지 않고 prop으로만 결정된다 (D-3.I1)', () => {
    const posts = renderToStaticMarkup(
      h(Shell, { command: 'ls posts/', title: '글 목록' }, null),
    );
    expect(posts).toContain('ls posts/');
    expect(posts).toContain('>글 목록</h1>');
    expect(posts).not.toContain('ls tags/');
  });

  it('children이 없어도 셸 구조가 유지된다', () => {
    const markup = renderToStaticMarkup(
      h(Shell, { command: 'ls about/', title: '소개' }, null),
    );
    expect(markup).toContain('<h1');
    expect(markup).toContain('cd ..');
  });
});

describe('ErrorLine — 필드 에러 라인 정본 (B-6 / C7)', () => {
  it('falsy message는 DOM 노드를 만들지 않는다 (B-6.I4)', () => {
    for (const message of [undefined, '', null as unknown as undefined, 0 as unknown as string]) {
      expect(renderToStaticMarkup(h(ErrorLine, { message }))).toBe('');
    }
  });

  it('`error: ` 접두사(콜론+공백)를 고정한다', () => {
    expect(renderToStaticMarkup(h(ErrorLine, { message: '댓글 내용을 입력해주세요.' }))).toContain(
      'error: 댓글 내용을 입력해주세요.',
    );
  });

  // ★ cn 인자 순서가 (className, base)인 것이 의도 — 소비처가 타이포·색을 덮지 못하게 한다
  it('소비처 className이 타이포·색을 덮지 못한다 (인자 순서 계약)', () => {
    const classes = classesOf(
      renderToStaticMarkup(
        h(ErrorLine, { message: 'x', className: 'mt-8 text-[20px] text-accent' }),
      ),
    );
    expect(classes).toContain('text-[11px]');
    expect(classes).toContain('text-error');
    expect(classes).not.toContain('text-[20px]');
    expect(classes).not.toContain('text-accent');
    expect(classes).toContain('mt-8');
  });

  it('className이 없을 때 클래스 문자열이 정확히 고정된다', () => {
    expect(renderToStaticMarkup(h(ErrorLine, { message: 'x' }))).toBe(
      '<p class="text-[11px] text-error">error: x</p>',
    );
  });

  it.each(['mt-8', 'px-16 pb-12', 'mt-6'])(
    '소비처 여백 클래스 %s가 base 앞에 보존된다 (치환 전 바이트 순서 유지)',
    (className) => {
      expect(renderToStaticMarkup(h(ErrorLine, { message: 'x', className }))).toBe(
        `<p class="${className} text-[11px] text-error">error: x</p>`,
      );
    },
  );

  it('message에 ReactNode를 넣어도 접두사 뒤에 렌더된다', () => {
    expect(
      renderToStaticMarkup(h(ErrorLine, { message: h('strong', null, '실패') })),
    ).toContain('error: <strong>실패</strong>');
  });
});

describe('CategoryBadge — 역상 배지 (D-1 / C6)', () => {
  // ★ 이번 브랜치가 `text-meta` → `text-[11px]`로 바꾼 지점.
  //   명명 토큰이면 tailwind-merge가 색상으로 오인해 뒤의 text-bg에 밀려 삭제되고
  //   배지 글자 크기가 부모 상속값으로 튄다 (SeriesNav 헤더에서 실제로 커짐).
  it('폰트 크기가 살아남는다 — text-[11px]가 text-bg에 삭제되지 않는다', () => {
    const classes = classesOf(renderToStaticMarkup(h(CategoryBadge, { category: 'SERIES' })));
    expect(classes).toEqual([
      'inline-block',
      'bg-text-dim',
      'px-8',
      'py-3',
      'text-[11px]',
      'leading-none',
      'text-bg',
    ]);
    // 명명 토큰으로 되돌리면 크기가 사라진다는 대비 — 이 성질이 이 테스트의 존재 이유다
    expect(cn('inline-block bg-text-dim px-8 py-3 text-meta leading-none text-bg')).not.toContain(
      'text-meta',
    );
  });

  it('href가 있으면 <a> + hover:bg-accent, 없으면 <span>이다', () => {
    const link = renderToStaticMarkup(
      h(CategoryBadge, { category: 'DEVOPS', href: '/categories/devops' }),
    );
    expect(link).toContain('<a ');
    expect(link).toContain('hover:bg-accent');
    const span = renderToStaticMarkup(h(CategoryBadge, { category: 'SERIES' }));
    expect(span).toContain('<span');
    expect(span).not.toContain('hover:bg-accent');
  });

  it('className이 병합되고 크기·색 축은 유지된다 (SeriesNav의 shrink-0)', () => {
    const classes = classesOf(
      renderToStaticMarkup(h(CategoryBadge, { category: 'SERIES', className: 'shrink-0' })),
    );
    expect(classes).toContain('shrink-0');
    expect(classes).toContain('text-[11px]');
    expect(classes).toContain('bg-text-dim');
  });

  it('배경은 WCAG AA 승급된 text-dim을 유지한다 (text-faint로 회귀 금지)', () => {
    const markup = renderToStaticMarkup(h(CategoryBadge, { category: 'X' }));
    expect(markup).toContain('bg-text-dim');
    expect(markup).not.toContain('bg-text-faint');
  });
});

describe('ErrorScreen — 에러 경계 공통 화면 (B-5 / C5)', () => {
  const render = (command: string, message: string) =>
    renderToStaticMarkup(h(ErrorScreen, { command, message, reset: () => {} }));

  it('command와 message는 통일하지 않고 prop으로만 결정된다 (B-5.I2)', () => {
    const global = render(
      './blog92 --render',
      'error: 예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    );
    const detail = render(
      'cat posts/….md',
      'error: 페이지를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
    );
    expect(global).toContain('./blog92 --render');
    expect(global).toContain('예상치 못한 오류가 발생했습니다');
    expect(detail).toContain('cat posts/….md');
    expect(detail).toContain('페이지를 불러올 수 없습니다');
    expect(global).not.toContain('cat posts/');
  });

  // ★ 접두사를 컴포넌트가 붙이지 않는다 — 붙이면 `error: `가 두 번 나온다 (B-6.1과 충돌)
  it('`error: ` 접두사를 스스로 붙이지 않는다 (message 전문을 그대로 렌더)', () => {
    const markup = render('x', 'error: 실패했습니다.');
    expect(markup).toContain('>error: 실패했습니다.</p>');
    expect([...markup.matchAll(/error: /g)]).toHaveLength(1);
  });

  it('두 버튼(retry / cd ~)이 항상 함께 렌더된다', () => {
    const markup = render('x', 'error: y');
    expect(markup).toContain('$ retry — 다시 시도');
    expect(markup).toContain('$ cd ~ — 홈으로');
    expect(markup).toContain('href="/"');
  });

  it('digest·스택 등 내부 정보를 노출하지 않는다 (B-5.4)', () => {
    const markup = render('x', 'error: y');
    expect(markup).not.toContain('digest');
    expect(markup).not.toContain('stack');
  });

  it('에러 문구 클래스와 레이아웃 여백이 고정된다', () => {
    const markup = render('x', 'error: y');
    expect(markup).toContain('<div class="mt-76">');
    expect(markup).toContain('class="mt-16 text-[13px] leading-[2.2] text-error"');
    expect(markup).toContain('mt-30 flex flex-wrap gap-12');
  });

  it('두 경계가 같은 구조를 공유한다 — 명령·문구를 제외한 마크업이 동일하다', () => {
    const normalize = (markup: string) =>
      markup.replace(/>[^<>]*</g, '><'); // 텍스트 노드 제거, 태그·클래스만 비교
    expect(normalize(render('./blog92 --render', 'error: a'))).toBe(
      normalize(render('cat posts/….md', 'error: b')),
    );
  });
});
