// react/jsx-dev-runtime은 **최초 로드 시점의** NODE_ENV로 dev/prod 구현을 고정한다.
// NODE_ENV='production'을 stub한 상태에서 처음 로드되면 jsxDEV가 비어 JSX 반환이 깨지는데,
// 이는 실제 Next 프로덕션 빌드(prod jsx 런타임으로 컴파일)와 무관한 테스트 아티팩트다.
// stub 이전(NODE_ENV='test')에 미리 로드해 dev 구현으로 고정한다.
import 'react/jsx-dev-runtime';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostMeta } from '@/types/common';

/**
 * `/posts/{slug}` 초안 차단 가드 테스트.
 *
 * ⚠️ 왜 라우트 모듈을 직접 로드하는가:
 *   판정 규칙(lib/posts/visibility.ts)만 테스트하면 **라우트에서 가드 호출을 지워도
 *   테스트가 전부 통과한다.** 노출을 막는 것은 호출 위치 자체이므로,
 *   generateMetadata와 페이지 본문 두 진입점을 각각 실행해 notFound()가 나는지 본다.
 *   (getPostBySlug가 draft를 그대로 돌려주는 계약은 mdx.contract.test.ts가 고정한다.)
 *
 * 파일시스템·DB·MDX 컴파일은 이 테스트의 관심사가 아니라 모두 모킹한다.
 */

const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

const post = {
  frontmatter: {
    title: '초안 제목',
    date: '2026-01-01',
    category: 'til',
    tags: ['t'],
    description: '초안 설명',
    keywords: ['k'],
    draft: false,
    slug: 'sample',
    readingTime: 3,
  } as PostMeta & { description: string | null },
  content: '본문입니다.',
};

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('@/lib/mdx', () => ({
  getPostBySlug: () => post,
  getPublishedPosts: () => [],
  getSeriesForPost: () => null,
}));

vi.mock('@/actions/comment', () => ({
  getCommentsByPostSlug: async () => [],
}));

vi.mock('next-mdx-remote/rsc', () => ({
  compileMDX: async () => ({ content: null }),
}));

// 댓글 섹션은 임포트만으로 Supabase 클라이언트를 만든다(useCommentRealtime) —
// 라우트 가드와 무관한 런타임 환경변수 의존이라 렌더 없는 더미로 대체한다
vi.mock('@/components/comments/CommentSection', () => ({
  CommentSection: () => null,
}));

async function loadRoute() {
  return import('./page');
}

function params(slug = 'sample') {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  post.frontmatter.draft = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('초안 글은 프로덕션에서 404다 (미존재 slug와 구분 불가)', () => {
  it('generateMetadata — draft 글의 제목·설명을 <head>로 내보내지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    post.frontmatter.draft = true;
    const { generateMetadata } = await loadRoute();

    await expect(generateMetadata(params())).rejects.toThrowError(NOT_FOUND);
  });

  it('페이지 본문 — draft 글을 렌더하지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    post.frontmatter.draft = true;
    const PostPage = (await loadRoute()).default;

    await expect(PostPage(params())).rejects.toThrowError(NOT_FOUND);
  });
});

describe('초안 글은 개발 환경에서 접근할 수 있다 (로컬 미리보기 보존)', () => {
  it('generateMetadata — draft 글의 메타데이터를 돌려준다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    post.frontmatter.draft = true;
    const { generateMetadata } = await loadRoute();

    await expect(generateMetadata(params())).resolves.toMatchObject({
      title: '초안 제목',
    });
  });

  it('페이지 본문 — draft 글을 렌더한다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    post.frontmatter.draft = true;
    const PostPage = (await loadRoute()).default;

    await expect(PostPage(params())).resolves.toBeTruthy();
  });
});

describe('발행 글은 두 환경 모두에서 정상이다 (가드 과차단 방지)', () => {
  for (const nodeEnv of ['production', 'development']) {
    it(`NODE_ENV=${nodeEnv} — generateMetadata가 메타데이터를 돌려준다`, async () => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      const { generateMetadata } = await loadRoute();

      await expect(generateMetadata(params())).resolves.toMatchObject({
        title: '초안 제목',
        description: '초안 설명',
      });
    });

    it(`NODE_ENV=${nodeEnv} — 페이지 본문이 렌더된다`, async () => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      const PostPage = (await loadRoute()).default;

      await expect(PostPage(params())).resolves.toBeTruthy();
    });
  }
});
