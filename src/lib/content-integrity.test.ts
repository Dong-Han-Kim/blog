import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

/**
 * content/posts 전수 무결성 가드 (QA content-import-20260917).
 *
 * 기존 검사(zod 파싱 / 카테고리=디렉토리 / 슬러그 중복 / 시리즈 order / 내부 링크 /
 * 코드펜스 짝 / MDX 컴파일)가 전부 통과했는데도 **실제 페이지를 열어야만 드러나는**
 * 결함이 4종 남아 있었다. 이 파일은 그 4종을 파일시스템 전수로 고정한다.
 *
 * ① GFM 취소선 오작동 — 한 문단/셀 안의 물결표 2개가 `<del>`로 짝지어져 본문 의미가 바뀐다.
 * ② Tailwind v4 content 스캔 오염 — 본문 토큰이 유효하지 않은 CSS 유틸리티를 생성해
 *    `next dev`의 CSS 파싱을 깨뜨린다(전 라우트 500). `next build`에서는 경고로만 나온다.
 * ③ shiki 미지원 언어 태그 — 하이라이팅이 조용히 평문으로 떨어진다.
 * ④ 태그 표기 갈라짐 — 같은 개념이 두 개의 /tags/{tag} 페이지로 쪼개진다.
 *
 * 모킹하지 않고 실제 content/posts를 읽는다 (series.test.ts의 "실제 콘텐츠 통합"과 동일 방침).
 */

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

interface PostFile {
  /** content/posts 기준 상대 경로 — 실패 메시지에 그대로 찍는다 */
  rel: string;
  abs: string;
  slug: string;
  raw: string;
  /** frontmatter를 뺀 본문 */
  body: string;
  /** raw 안에서 본문이 시작하는 줄 번호(1-based) — 실패 메시지의 줄 번호 보정용 */
  bodyStartLine: number;
  data: Record<string, unknown>;
}

function readAllPosts(): PostFile[] {
  const files: PostFile[] = [];
  for (const category of fs.readdirSync(POSTS_DIR)) {
    const dir = path.join(POSTS_DIR, category);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(dir, name);
      const raw = fs.readFileSync(abs, 'utf-8');
      const parsed = matter(raw);
      const bodyIndex = raw.indexOf(parsed.content);
      files.push({
        rel: path.join('content', 'posts', category, name),
        abs,
        slug: name.replace(/\.md$/, ''),
        raw,
        body: parsed.content,
        bodyStartLine: raw.slice(0, bodyIndex).split('\n').length - 1,
        data: parsed.data as Record<string, unknown>,
      });
    }
  }
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

const posts = readAllPosts();

it('전수 검사 대상이 비어 있지 않다 (가드 자체가 무력화되지 않았음을 확인)', () => {
  expect(posts.length).toBeGreaterThan(100);
});

/* ------------------------------------------------------------------ */
/* ① GFM 취소선 — 물결표가 범위 표기인데 <del>로 짝지어지는 사고                */
/* ------------------------------------------------------------------ */

interface DeleteHit {
  rel: string;
  line: number;
  marker: string;
  text: string;
}

/**
 * 본문을 사이트와 동일한 파서(remark + remark-gfm)로 파싱해 `delete` 노드를 찾는다.
 * `~~취소선~~`(의도적)과 `~범위~`(사고)를 구분하기 위해 노드 시작 위치의 구분자
 * 길이를 원문에서 직접 확인한다 — 단일 물결표로 열린 것만 결함으로 본다.
 */
function findSingleTildeDeletes(post: PostFile): DeleteHit[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(post.body);
  const hits: DeleteHit[] = [];

  const walk = (node: unknown) => {
    const n = node as {
      type?: string;
      children?: unknown[];
      position?: { start: { offset?: number; line: number } };
    };
    if (n.type === 'delete' && n.position?.start.offset !== undefined) {
      const start = n.position.start.offset;
      const opener = post.body.slice(start, start + 2);
      if (opener !== '~~') {
        const lineInBody = n.position.start.line;
        hits.push({
          rel: post.rel,
          line: post.bodyStartLine + lineInBody,
          marker: '~',
          text: post.body.split('\n')[lineInBody - 1]?.trim().slice(0, 120) ?? '',
        });
      }
    }
    for (const child of n.children ?? []) walk(child);
  };

  walk(tree);
  return hits;
}

describe('① GFM 취소선 — 범위 표기 물결표가 <del>로 짝지어지지 않는다', () => {
  it('단일 물결표로 열린 delete 노드가 저장소 전체에 0건이다', () => {
    const hits = posts.flatMap(findSingleTildeDeletes);
    const report = hits
      .map((h) => `${h.rel}:${h.line}  →  ${h.text}`)
      .join('\n');

    expect(
      hits,
      hits.length === 0
        ? ''
        : `\n한 줄 안의 물결표 2개가 GFM 취소선으로 짝지어져 본문이 훼손됩니다.\n` +
            `예: "1~4강 약 2개월, 5~7강" → "1<del>4강 약 2개월, 5</del>7강" (화면에서 "14강", "57강"으로 읽힘).\n` +
            `수정: 물결표를 이스케이프(\\~)하거나 "1–4강"처럼 다른 기호를 쓴다.\n${report}\n`,
    ).toHaveLength(0);
  });

  it('의도적인 이중 물결표 취소선은 결함으로 보지 않는다 (가드 오탐 방지)', () => {
    const sample: PostFile = {
      rel: 'fixture.md',
      abs: 'fixture.md',
      slug: 'fixture',
      raw: '~~진짜 취소선~~',
      body: '~~진짜 취소선~~',
      bodyStartLine: 0,
      data: {},
    };
    expect(findSingleTildeDeletes(sample)).toHaveLength(0);
  });

  it('단일 물결표 범위 표기는 결함으로 잡는다 (가드 미탐 방지)', () => {
    const sample: PostFile = {
      rel: 'fixture.md',
      abs: 'fixture.md',
      slug: 'fixture',
      raw: '권장 기간: 1~4강 약 2개월, 5~7강 약 2개월.',
      body: '권장 기간: 1~4강 약 2개월, 5~7강 약 2개월.',
      bodyStartLine: 0,
      data: {},
    };
    expect(findSingleTildeDeletes(sample)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* ② Tailwind v4 content 스캔 — 본문 토큰이 CSS를 생성하면 안 된다            */
/* ------------------------------------------------------------------ */

/**
 * 본문의 대괄호 토큰(Ansible 인벤토리 섹션 헤더 등)이 Tailwind 임의 속성 유틸리티로
 * 해석되면 유효하지 않은 CSS가 생성되고, Lightning CSS가 스타일시트 파싱에 실패해
 * `next dev`의 **모든 라우트가 500**이 된다. `next build`는 경고 후 규칙을 버리므로
 * 빌드만 보면 영원히 드러나지 않는다 (2026-09-17 실제 발생).
 *
 * 근본 차단은 `globals.css`가 자동 content 감지를 끄고(`source(none)`) 스캔 범위를
 * src/로 고정하는 것이다. 이 테스트는 **그 방어가 제자리에 있는지**를 고정한다.
 * 방어가 사라지면 본문 토큰 스캔으로 넘어가 실제 위반 지점을 짚어 준다.
 */
const BRACKET_CANDIDATE = /\[[a-zA-Z-]+:[^\s\]]*\]/g;

function collectBracketCandidates(): Map<string, string> {
  const found = new Map<string, string>();
  for (const post of posts) {
    post.raw.split('\n').forEach((line, i) => {
      for (const match of line.matchAll(BRACKET_CANDIDATE)) {
        if (!found.has(match[0])) found.set(match[0], `${post.rel}:${i + 1}`);
      }
    });
  }
  return found;
}

describe('② Tailwind content 스캔 — 본문 토큰이 CSS 유틸리티를 만들지 않는다', () => {
  const globalsCss = fs.readFileSync(
    path.join(process.cwd(), 'src/app/globals.css'),
    'utf-8',
  );

  it('globals.css가 자동 content 감지를 끄고 스캔 범위를 src/로 고정한다', () => {
    expect(
      globalsCss,
      '\n@import "tailwindcss"에서 source(none)이 빠지면 Tailwind가 content/posts 본문까지\n' +
        '훑어 본문 텍스트로 CSS 규칙을 만듭니다. next dev가 전 라우트 500이 됩니다.\n',
    ).toMatch(/@import\s+['"]tailwindcss['"]\s+source\(none\)/);
    expect(globalsCss).toMatch(/@source\s+['"]\.\.\/\.\.\/src['"]/);
  });

  it('방어가 없다면 본문 대괄호 토큰이 CSS 유틸리티를 만들지 않아야 한다', async () => {
    const guarded = /source\(none\)/.test(globalsCss);
    const candidates = collectBracketCandidates();
    if (guarded || candidates.size === 0) return; // 범위가 고정돼 있으면 본문은 스캔되지 않는다

    const { compile } = await import('tailwindcss');
    const entry = require.resolve('tailwindcss/index.css');
    const design = await compile(`@import 'tailwindcss';`, {
      base: process.cwd(),
      loadStylesheet: async () => ({
        base: path.dirname(entry),
        content: fs.readFileSync(entry, 'utf-8'),
        path: entry,
      }),
    });

    const baseline = design.build([]);
    const offenders: string[] = [];
    for (const [candidate, where] of candidates) {
      const css = design.build([candidate]);
      if (css !== baseline) {
        offenders.push(`${where}  "${candidate}"`);
      }
    }
    expect(offenders).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* ③ 코드펜스 언어 태그 — shiki가 실제로 하이라이팅할 수 있어야 한다            */
/* ------------------------------------------------------------------ */

/**
 * `posts/[slug]/page.tsx`는 rehype-pretty-code + shiki로 하이라이팅한다.
 * shiki 번들에 없는 언어는 **에러 없이** 평문으로 떨어져서, 헤더 바에는 언어명이
 * 찍히는데 색은 하나도 입지 않는다. 빌드·테스트·MDX 컴파일 전부 통과하므로
 * 페이지를 눈으로 열기 전까지 드러나지 않는다.
 *
 * `text`는 page.tsx의 `defaultLang: 'text'`와 같은 값이라 의도된 평문 취급이다.
 */
const PLAINTEXT_ALLOWED = new Set(['text', 'txt', 'plaintext', 'plain', 'ansi']);

/**
 * shiki 번들에 없지만 **의도적으로** 쓰는 언어. 헤더 바에 찍히는 언어명 자체가
 * 독자에게 정보라서, `text`로 낮추면 오히려 정보가 준다. 색만 빠지고 내용은 읽힌다.
 * 새 언어를 여기 넣을 때는 "shiki에 없다"는 것을 확인하고 이유를 함께 적을 것.
 */
const UNSUPPORTED_BY_DESIGN = new Map([
  ['promql', 'Prometheus 쿼리 — shiki 번들에 문법 정의가 없다 (infra-07, infra-10)'],
]);

describe('③ 코드펜스 언어 태그 — shiki가 인식하는 언어만 쓴다', () => {
  it('shiki 번들에 없는 언어 태그가 0건이다', async () => {
    const { bundledLanguages } = await import('shiki');
    const known = new Set([
      ...Object.keys(bundledLanguages),
      ...PLAINTEXT_ALLOWED,
      ...UNSUPPORTED_BY_DESIGN.keys(),
    ]);

    const offenders: string[] = [];
    for (const post of posts) {
      post.body.split('\n').forEach((line, i) => {
        const fence = /^```([A-Za-z0-9_+#.-]+)/.exec(line);
        if (!fence) return;
        const lang = fence[1].toLowerCase();
        if (!known.has(lang)) {
          offenders.push(
            `${post.rel}:${post.bodyStartLine + i + 1}  \`\`\`${fence[1]}`,
          );
        }
      });
    }

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `\nshiki가 모르는 언어 태그입니다. 에러 없이 하이라이팅만 조용히 사라집니다.\n` +
            `수정: shiki가 아는 인접 언어로 바꾸거나(promql → text) 언어 태그를 지운다.\n` +
            `${offenders.join('\n')}\n`,
    ).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* ④ 태그 표기 갈라짐 — 같은 개념이 두 개의 태그 페이지로 쪼개지면 안 된다       */
/* ------------------------------------------------------------------ */

/**
 * `/tags/{tag}`는 `getPostsByTag`가 **완전 일치**로만 모은다(mdx.contract.test.ts).
 * `서버 운영`과 `서버운영`처럼 공백·하이픈·대소문자만 다른 표기가 섞이면
 * 태그 페이지와 태그 인덱스가 조용히 둘로 쪼개진다.
 */
function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[\s_\-·]/g, '');
}

describe('④ 태그 표기 — 같은 개념이 두 표기로 갈라지지 않는다', () => {
  it('정규화 후 충돌하는 태그 표기가 0건이다', () => {
    const byNormalized = new Map<string, Map<string, string[]>>();
    for (const post of posts) {
      const tags = Array.isArray(post.data.tags)
        ? (post.data.tags as string[])
        : [];
      for (const tag of tags) {
        const key = normalizeTag(tag);
        if (!byNormalized.has(key)) byNormalized.set(key, new Map());
        const variants = byNormalized.get(key)!;
        if (!variants.has(tag)) variants.set(tag, []);
        variants.get(tag)!.push(post.slug);
      }
    }

    const offenders = [...byNormalized.entries()]
      .filter(([, variants]) => variants.size > 1)
      .map(
        ([key, variants]) =>
          `"${key}" → ` +
          [...variants.entries()]
            .map(([tag, slugs]) => `'${tag}'(${slugs.length}편: ${slugs.join(', ')})`)
            .join('  vs  '),
      );

    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `\n같은 개념이 여러 표기로 나뉘어 /tags/{tag} 페이지가 쪼개집니다.\n` +
            `수정: 한 표기로 통일한다.\n${offenders.join('\n')}\n`,
    ).toHaveLength(0);
  });
});
