import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { sortPostsByDate } from './posts/sort';

/**
 * QA 계약 테스트 — lib/mdx.ts (C-1 / C-3 / 시리즈 정본).
 *
 * ⚠️ 왜 픽스처 파일시스템인가:
 *   현재 `content/`에 draft 글이 0건이라 **getPublishedPosts의 draft 필터가 깨져도
 *   아무 테스트가 잡지 못한다.** 설계 §8.3-④는 `_draft-probe.md`를 임시 투입했다가
 *   지우는 수동 절차로 이를 덮었지만, 그 절차는 커밋에 남지 않아 회귀를 막지 못한다.
 *   여기서는 os.tmpdir()에 격리된 content 트리를 만들고 process.cwd()를 그쪽으로
 *   돌린 뒤 mdx를 동적 import한다 (postsDirectory가 모듈 로드 시점에 확정되므로).
 *   저장소의 `content/`는 읽지도 쓰지도 않는다.
 */

interface Fixture {
  category: string;
  slug: string;
  title?: string;
  date?: string;
  tags?: string[];
  description?: string | null;
  draft?: boolean;
  keywords?: string[];
  series?: string;
  seriesOrder?: number;
  body?: string;
  /** 원시 frontmatter를 직접 지정 (스키마 위반 케이스용) */
  raw?: string;
}

const tempRoots: string[] = [];

// eslint-disable-next-line no-unused-vars -- 타입 시그니처의 파라미터명
function writeFixtures(fixtures: Fixture[], extra?: (root: string) => void): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-contract-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'content', 'posts'), { recursive: true });

  for (const f of fixtures) {
    const dir = path.join(root, 'content', 'posts', f.category);
    fs.mkdirSync(dir, { recursive: true });
    const front =
      f.raw ??
      [
        '---',
        `title: '${f.title ?? f.slug}'`,
        `date: '${f.date ?? '2026-01-01'}'`,
        `category: '${f.category}'`,
        `tags: [${(f.tags ?? ['t']).map((t) => `'${t}'`).join(', ')}]`,
        `description: ${f.description === null ? 'null' : `'${f.description ?? 'desc'}'`}`,
        ...(f.draft === undefined ? [] : [`draft: ${f.draft}`]),
        `keywords: [${(f.keywords ?? ['k']).map((k) => `'${k}'`).join(', ')}]`,
        ...(f.series === undefined ? [] : [`series: '${f.series}'`]),
        ...(f.seriesOrder === undefined ? [] : [`seriesOrder: ${f.seriesOrder}`]),
        '---',
        '',
      ].join('\n');
    fs.writeFileSync(path.join(dir, `${f.slug}.md`), `${front}${f.body ?? '본문입니다.'}\n`);
  }

  extra?.(root);
  return root;
}

/** 격리된 content 트리를 세우고 그 위에서 mdx 모듈을 새로 로드한다 */
// eslint-disable-next-line no-unused-vars -- 타입 시그니처의 파라미터명
async function loadMdx(fixtures: Fixture[], extra?: (root: string) => void) {
  const root = writeFixtures(fixtures, extra);
  const spy = vi.spyOn(process, 'cwd').mockReturnValue(root);
  vi.resetModules();
  const mdx = await import('./mdx');
  spy.mockRestore(); // postsDirectory는 이미 확정 — 이후 cwd는 원복해도 무방
  return mdx;
}

/** notFound()가 던지는 Next 내부 예외 */
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
/** redirect('/')가 던지는 Next 내부 예외 (digest 접두사) */
const REDIRECT = 'NEXT_REDIRECT';

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('getPublishedPosts — draft 필터 정본 (C-3 / H2-a)', () => {
  const mixed: Fixture[] = [
    { category: 'til', slug: 'published-a', draft: false },
    { category: 'til', slug: 'draft-a', draft: true },
    { category: 'linux', slug: 'draft-b', draft: true },
    { category: 'linux', slug: 'published-b', draft: false },
    { category: 'linux', slug: 'no-draft-field' }, // draft 필드 자체가 없음 → 기본 false
  ];

  // ★ 이 저장소의 content/ 에는 draft 글이 0건이라 실콘텐츠로는 절대 검출되지 않는 회귀다
  it('draft: true 인 글을 전부 제외한다', async () => {
    const { getPublishedPosts } = await loadMdx(mixed);
    const slugs = getPublishedPosts().map((p) => p.slug).sort();
    expect(slugs).toEqual(['no-draft-field', 'published-a', 'published-b']);
    expect(getPublishedPosts().some((p) => p.draft)).toBe(false);
  });

  it('draft 필드가 없는 글은 발행으로 취급한다 (스키마 기본값 false)', async () => {
    const { getPublishedPosts } = await loadMdx(mixed);
    const post = getPublishedPosts().find((p) => p.slug === 'no-draft-field');
    expect(post).toBeDefined();
    expect(post?.draft).toBe(false);
  });

  it('getAllPosts는 draft를 포함한다 — 두 함수의 차이가 정확히 draft 집합이다', async () => {
    const { getAllPosts, getPublishedPosts } = await loadMdx(mixed);
    const all = getAllPosts();
    const published = getPublishedPosts();
    expect(all).toHaveLength(5);
    expect(published).toHaveLength(3);
    const excluded = all.filter((p) => !published.some((q) => q.slug === p.slug));
    expect(excluded.map((p) => p.slug).sort()).toEqual(['draft-a', 'draft-b']);
    expect(excluded.every((p) => p.draft)).toBe(true);
  });

  it('전 글이 draft면 빈 배열을 반환한다 (throw하지 않는다)', async () => {
    const { getPublishedPosts } = await loadMdx([
      { category: 'til', slug: 'd1', draft: true },
      { category: 'til', slug: 'd2', draft: true },
    ]);
    expect(getPublishedPosts()).toEqual([]);
  });

  // ★ C-3.I2 — 여기서 정렬하면 호출부의 sortPostsByDate와 이중 적용된다
  it('정렬하지 않는다 — getAllPosts의 순서를 그대로 보존한다', async () => {
    const { getAllPosts, getPublishedPosts } = await loadMdx([
      // 디렉토리 읽기 순서(aaa → zzz)와 날짜 내림차순(zzz → aaa)이 어긋나게 배치
      { category: 'aaa', slug: 'aaa-old', date: '2020-01-01' },
      { category: 'zzz', slug: 'zzz-new', date: '2030-01-01' },
    ]);
    const allOrder = getAllPosts().map((p) => p.slug);
    expect(getPublishedPosts().map((p) => p.slug)).toEqual(allOrder);
    // 날짜순이 아님을 명시 — 정렬은 호출부 책임이다
    expect(getPublishedPosts().map((p) => p.slug)).not.toEqual(
      sortPostsByDate(getPublishedPosts()).map((p) => p.slug),
    );
  });

  it('호출마다 새 배열을 반환해 호출부가 서로를 오염시키지 않는다', async () => {
    const { getPublishedPosts } = await loadMdx(mixed);
    const first = getPublishedPosts();
    first.length = 0;
    expect(getPublishedPosts()).toHaveLength(3);
  });

  // ★ C-3.I4 — 자체 try/catch를 두면 getAllPosts의 에러 정책이 삼켜진다
  it('content 디렉토리가 없으면 getAllPosts와 동일하게 notFound()로 낙하한다', async () => {
    const { getAllPosts, getPublishedPosts } = await loadMdx([], (root) => {
      fs.rmSync(path.join(root, 'content', 'posts'), { recursive: true, force: true });
    });
    expect(() => getAllPosts()).toThrowError(NOT_FOUND);
    expect(() => getPublishedPosts()).toThrowError(NOT_FOUND);
  });
});

describe('getAllPosts — 파일시스템 주사 규칙', () => {
  it('content/posts 직속 파일(비디렉토리)은 건너뛴다', async () => {
    const { getAllPosts } = await loadMdx(
      [{ category: 'til', slug: 'real' }],
      (root) => {
        fs.writeFileSync(path.join(root, 'content', 'posts', '.DS_Store'), 'junk');
        fs.writeFileSync(path.join(root, 'content', 'posts', 'stray.md'), '---\n---\n');
      },
    );
    expect(getAllPosts().map((p) => p.slug)).toEqual(['real']);
  });

  it('카테고리 디렉토리 안의 비 .md 파일은 무시한다', async () => {
    const { getAllPosts } = await loadMdx([{ category: 'til', slug: 'real' }], (root) => {
      const dir = path.join(root, 'content', 'posts', 'til');
      fs.writeFileSync(path.join(dir, 'image.png'), 'x');
      fs.writeFileSync(path.join(dir, 'notes.mdx'), 'x');
      fs.writeFileSync(path.join(dir, 'readme.txt'), 'x');
    });
    expect(getAllPosts().map((p) => p.slug)).toEqual(['real']);
  });

  it('빈 카테고리 디렉토리는 결과에 영향을 주지 않는다', async () => {
    const { getAllPosts } = await loadMdx([{ category: 'til', slug: 'real' }], (root) => {
      fs.mkdirSync(path.join(root, 'content', 'posts', 'empty'));
    });
    expect(getAllPosts()).toHaveLength(1);
  });

  it('slug는 파일명에서 .md만 벗긴 값이다 (디렉토리명이 섞이지 않는다)', async () => {
    const { getAllPosts } = await loadMdx([
      { category: 'linux', slug: 'linux-commands-1-basics' },
    ]);
    expect(getAllPosts()[0].slug).toBe('linux-commands-1-basics');
    expect(getAllPosts()[0].category).toBe('linux');
  });

  it('readingTime 파생 필드가 항상 채워진다', async () => {
    const { getAllPosts } = await loadMdx([
      { category: 'til', slug: 'a', body: '단어 '.repeat(600) },
    ]);
    expect(getAllPosts()[0].readingTime).toBeGreaterThan(0);
  });

  // ⚠️ 서로 다른 카테고리에 같은 파일명이 있으면 slug가 충돌한다 (현행 계약 — 방어하지 않는다)
  it('카테고리가 달라도 파일명이 같으면 slug가 중복된 채 두 건이 나온다', async () => {
    const { getAllPosts } = await loadMdx([
      { category: 'til', slug: 'dup' },
      { category: 'linux', slug: 'dup' },
    ]);
    const all = getAllPosts();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.slug)).toEqual(['dup', 'dup']);
    expect(all.map((p) => p.category).sort()).toEqual(['linux', 'til']);
  });

  // ★ C-1.I1 — readPostFile이 예외를 삼키면 소프트 404(QA-H1)가 재발한다
  it('frontmatter 스키마 위반은 redirect(/)로 낙하한다 (조용히 건너뛰지 않는다)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllPosts } = await loadMdx([
      { category: 'til', slug: 'ok' },
      {
        category: 'til',
        slug: 'broken',
        raw: "---\ntitle: 'x'\ndate: 'not-a-date'\ncategory: 'til'\ntags: ['t']\ndescription: 'd'\nkeywords: ['k']\n---\n",
      },
    ]);
    expect(() => getAllPosts()).toThrowError(REDIRECT);
  });

  it('필수 필드 누락(tags 빈 배열)도 redirect(/)로 낙하한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllPosts } = await loadMdx([
      {
        category: 'til',
        slug: 'broken',
        raw: "---\ntitle: 'x'\ndate: '2026-01-01'\ncategory: 'til'\ntags: []\ndescription: 'd'\nkeywords: ['k']\n---\n",
      },
    ]);
    expect(() => getAllPosts()).toThrowError(REDIRECT);
  });
});

describe('getPostBySlug / getPostsByCategory — 함수별 에러 정책 (의도적 중복, C-2)', () => {
  const one: Fixture[] = [{ category: 'til', slug: 'hello', body: '# 제목\n\n본문' }];

  it('존재하는 slug는 frontmatter + content를 돌려준다', async () => {
    const { getPostBySlug } = await loadMdx(one);
    const post = getPostBySlug('hello');
    expect(post.frontmatter.slug).toBe('hello');
    expect(post.frontmatter.readingTime).toBeGreaterThan(0);
    expect(post.content).toContain('본문');
  });

  // ★ QA-H1 회귀 지점: try 밖에서 notFound()를 던져야 한다. try 안이면 catch가
  //   NEXT_HTTP_ERROR를 삼키고 redirect('/')로 낙하해 소프트 404가 된다.
  it('없는 slug는 notFound()다 — redirect(/)로 낙하하지 않는다 (소프트 404 회귀)', async () => {
    const { getPostBySlug } = await loadMdx(one);
    expect(() => getPostBySlug('nope')).toThrowError(NOT_FOUND);
    expect(() => getPostBySlug('nope')).not.toThrowError(REDIRECT);
  });

  it('getPostBySlug는 draft 글도 그대로 돌려준다 (본문 노출 판단은 호출부 몫)', async () => {
    const { getPostBySlug } = await loadMdx([
      { category: 'til', slug: 'secret', draft: true },
    ]);
    expect(getPostBySlug('secret').frontmatter.draft).toBe(true);
  });

  // ★ 세 catch 블록의 ENOENT 정책이 서로 다르다는 것이 C-2의 통합 금지 근거다
  it('없는 카테고리는 notFound가 아니라 빈 배열이다 (getAllPosts와 정책이 다르다)', async () => {
    const { getPostsByCategory, getAllPosts } = await loadMdx(one);
    expect(getPostsByCategory('does-not-exist')).toEqual([]);
    expect(() => getAllPosts()).not.toThrow();
  });

  it('getPostsByCategory는 draft를 포함한다 (페이지가 뒤에서 거른다)', async () => {
    const { getPostsByCategory } = await loadMdx([
      { category: 'til', slug: 'pub', draft: false },
      { category: 'til', slug: 'hidden', draft: true },
    ]);
    expect(getPostsByCategory('til').map((p) => p.slug).sort()).toEqual(['hidden', 'pub']);
  });

  it('getPostsByTag는 draft를 포함한다 — /tags/{tag} 페이지의 2차 필터가 필수다', async () => {
    const { getPostsByTag } = await loadMdx([
      { category: 'til', slug: 'pub', tags: ['Linux'], draft: false },
      { category: 'til', slug: 'hidden', tags: ['Linux'], draft: true },
    ]);
    const posts = getPostsByTag('Linux');
    expect(posts).toHaveLength(2);
    expect(posts.filter((p) => !p.draft)).toHaveLength(1);
  });

  it('getPostsByTag는 완전 일치만 매칭한다 (대소문자·부분 일치 없음)', async () => {
    const { getPostsByTag } = await loadMdx([
      { category: 'til', slug: 'a', tags: ['Linux'] },
    ]);
    expect(getPostsByTag('Linux')).toHaveLength(1);
    expect(getPostsByTag('linux')).toHaveLength(0);
    expect(getPostsByTag('Lin')).toHaveLength(0);
    expect(getPostsByTag('')).toHaveLength(0);
  });
});

describe('시리즈 정본 — sortSeriesPosts / getSeriesForPost', () => {
  const series: Fixture[] = [
    { category: 'linux', slug: 's-3', series: '리눅스 명령어', seriesOrder: 3, date: '2026-08-27' },
    { category: 'linux', slug: 's-1', series: '리눅스 명령어', seriesOrder: 1, date: '2026-08-26' },
    { category: 'linux', slug: 's-2', series: '리눅스 명령어', seriesOrder: 2, date: '2026-08-26' },
    { category: 'linux', slug: 's-draft', series: '리눅스 명령어', seriesOrder: 4, draft: true },
    { category: 'til', slug: 'solo' },
  ];

  it('seriesOrder 오름차순으로 정렬한다 (목록 정렬과 방향이 반대다)', async () => {
    const { getPostsBySeries } = await loadMdx(series);
    expect(getPostsBySeries('리눅스 명령어').map((p) => p.slug)).toEqual(['s-1', 's-2', 's-3']);
  });

  it('draft 편을 제외한다', async () => {
    const { getPostsBySeries } = await loadMdx(series);
    expect(getPostsBySeries('리눅스 명령어').map((p) => p.slug)).not.toContain('s-draft');
  });

  it('시리즈명은 trim 후 완전 일치다', async () => {
    const { getPostsBySeries } = await loadMdx(series);
    expect(getPostsBySeries('  리눅스 명령어  ')).toHaveLength(3);
    expect(getPostsBySeries('리눅스')).toHaveLength(0);
  });

  it('seriesOrder 누락 편은 맨 뒤로 간다 (?? Infinity)', async () => {
    const { getPostsBySeries } = await loadMdx([
      { category: 'a', slug: 'no-order', series: 'S' },
      { category: 'a', slug: 'order-2', series: 'S', seriesOrder: 2 },
      { category: 'a', slug: 'order-1', series: 'S', seriesOrder: 1 },
    ]);
    expect(getPostsBySeries('S').map((p) => p.slug)).toEqual([
      'order-1',
      'order-2',
      'no-order',
    ]);
  });

  it('seriesOrder가 중복되면 date → slug 순으로 결정적으로 갈린다', async () => {
    const { getPostsBySeries } = await loadMdx([
      { category: 'a', slug: 'zzz', series: 'S', seriesOrder: 1, date: '2026-01-01' },
      { category: 'a', slug: 'aaa', series: 'S', seriesOrder: 1, date: '2026-01-01' },
      { category: 'a', slug: 'mmm', series: 'S', seriesOrder: 1, date: '2025-01-01' },
    ]);
    expect(getPostsBySeries('S').map((p) => p.slug)).toEqual(['mmm', 'aaa', 'zzz']);
  });

  // ★ 의도적 이원화: 같은 입력에 대해 두 정렬 정본이 서로 다른 답을 내야 한다
  it('sortSeriesPosts와 sortPostsByDate는 의도적으로 다른 순서를 낸다', async () => {
    const { getPostsBySeries } = await loadMdx(series);
    const bySeries = getPostsBySeries('리눅스 명령어');
    const byDate = sortPostsByDate(bySeries, 'newest');
    expect(bySeries.map((p) => p.slug)).toEqual(['s-1', 's-2', 's-3']);
    expect(byDate.map((p) => p.slug)).toEqual(['s-3', 's-2', 's-1']);
    expect(bySeries.map((p) => p.slug)).not.toEqual(byDate.map((p) => p.slug));
  });

  it('getSeriesForPost가 name·currentIndex·prev·next를 도출한다', async () => {
    const { getSeriesForPost } = await loadMdx(series);
    const info = getSeriesForPost('s-2')!;
    expect(info.name).toBe('리눅스 명령어');
    expect(info.posts.map((p) => p.slug)).toEqual(['s-1', 's-2', 's-3']);
    expect(info.currentIndex).toBe(1);
    expect(info.prev?.slug).toBe('s-1');
    expect(info.next?.slug).toBe('s-3');
  });

  it('첫 편은 prev가 null, 마지막 편은 next가 null', async () => {
    const { getSeriesForPost } = await loadMdx(series);
    expect(getSeriesForPost('s-1')!.prev).toBeNull();
    expect(getSeriesForPost('s-1')!.next?.slug).toBe('s-2');
    expect(getSeriesForPost('s-3')!.next).toBeNull();
  });

  it('시리즈 미소속 글은 null', async () => {
    const { getSeriesForPost } = await loadMdx(series);
    expect(getSeriesForPost('solo')).toBeNull();
  });

  it('존재하지 않는 slug는 null (throw하지 않는다)', async () => {
    const { getSeriesForPost } = await loadMdx(series);
    expect(getSeriesForPost('없는-글')).toBeNull();
  });

  it('현재 글이 draft면 currentIndex는 -1이고 prev·next가 모두 null이다', async () => {
    const { getSeriesForPost } = await loadMdx(series);
    const info = getSeriesForPost('s-draft')!;
    expect(info.currentIndex).toBe(-1);
    expect(info.prev).toBeNull();
    expect(info.next).toBeNull();
    expect(info.posts.map((p) => p.slug)).toEqual(['s-1', 's-2', 's-3']);
  });

  it('시리즈 전 편이 draft면 null을 반환해 박스를 렌더하지 않는다', async () => {
    const { getSeriesForPost } = await loadMdx([
      { category: 'a', slug: 'only', series: 'S', seriesOrder: 1, draft: true },
    ]);
    expect(getSeriesForPost('only')).toBeNull();
  });

  it('seriesOrder만 있고 series가 없으면 시리즈로 취급하지 않고 경고한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getSeriesForPost } = await loadMdx([
      { category: 'a', slug: 'orphan-order', seriesOrder: 2 },
    ]);
    expect(getSeriesForPost('orphan-order')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('orphan-order'));
  });
});
