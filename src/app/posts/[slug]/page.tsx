import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ComponentProps } from 'react';

import { getAllPosts, getPostBySlug, getSeriesForPost } from '@/lib/mdx';
import { sortPostsByDate } from '@/lib/posts/sort';
import { tagHref } from '@/lib/routes';
import { remarkStripFirstH1 } from '@/lib/remark-strip-title';
import { crtTheme } from '@/lib/shiki-theme';
import { Callout, CodeBlock, ImageWithCaption } from '@/components/mdx';
import { SeriesNav } from '@/components/posts/SeriesNav';
import { TableOfContents } from '@/components/posts/TableOfContents';
import { PromptLine } from '@/components/terminal/PromptLine';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';
import { CategoryBadge } from '@/components/terminal/CategoryBadge';
import { CommentSection } from '@/components/comments/CommentSection';
import { getCommentsByPostSlug } from '@/actions/comment';
import type { Comment } from '@/types/comment';

// Comments are fetched at request time; disable static prerendering for this route
export const dynamic = 'force-dynamic';
// 참고(QA-H1): 미존재 slug는 getPostBySlug의 notFound()가 404 페이지를 렌더한다.
// 단, 이 라우트는 스트리밍(loading.tsx + force-dynamic)이라 HTTP 상태는 200이며
// Next가 noindex 메타를 주입해 SEO를 방어한다 (스트림 시작 후 상태코드 변경 불가 —
// Next 공식 문서 명시). dynamicParams=false는 force-dynamic 하에서 무효라 쓰지 않는다

const mdxComponents = {
  Callout,
  CodeBlock,
  ImageWithCaption,
  // 코드 펜스 전체를 헤더 바(언어명 + COPY) 래퍼로 감싼다 (설계 §7.5)
  pre: CodeBlock,
  // 인용 블록 — .post-body(globals, A 소유)에 규칙이 없어 컴포넌트 매핑으로 최소 스타일
  blockquote: (props: ComponentProps<'blockquote'>) => (
    <blockquote className="my-24 border-l border-rule pl-16 text-text-muted" {...props} />
  ),
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts
    .filter((post) => !post.draft)
    .map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    keywords: post.frontmatter.keywords,
  };
}

function getAdjacentPosts(currentSlug: string) {
  // 정렬은 정본 함수(lib/posts/sort.ts, 기본 newest) — 최신순 기준 prev=이전(더 오래된) 글.
  // 동일 날짜 글의 prev/next는 같은 시리즈+seriesOrder면 시리즈 순서, 그 외 그룹 키(시리즈명/slug) tie-break로 결정화된다
  const allPosts = sortPostsByDate(getAllPosts().filter((post) => !post.draft));

  const currentIndex = allPosts.findIndex((post) => post.slug === currentSlug);
  return {
    prev: currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null,
    next: currentIndex > 0 ? allPosts[currentIndex - 1] : null,
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { content: mdxContent } = await compileMDX({
    source: post.content,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkStripFirstH1],
        rehypePlugins: [
          rehypeSlug,
          // 3단계 그린 인광 하이라이트 — 배경·테두리는 CodeBlock 래퍼 담당 (설계 §6.2)
          [rehypePrettyCode, { theme: crtTheme, keepBackground: false, defaultLang: 'text' }],
        ],
      },
    },
  });

  const { prev, next } = getAdjacentPosts(slug);
  const series = getSeriesForPost(slug);

  let initialComments: Comment[] = [];
  try {
    initialComments = await getCommentsByPostSlug(slug);
  } catch (error) {
    console.error('댓글 조회 실패:', error);
  }

  return (
    // 상세 페이지 하단 패딩 64px — layout의 pb-60과의 4px 차 보정 (설계 §2.6)
    <div className="pb-4">
      {/* 브레드크럼 프롬프트 */}
      <PromptLine command={`cat posts/${slug}.md`} className="mt-20 mb-56" />

      {/* 타이틀 블록 */}
      <header className="mb-56 max-w-780">
        <div className="mb-20 flex items-center gap-18 text-[11px] leading-[1.9] text-text-dim">
          <CategoryBadge
            category={post.frontmatter.category.toUpperCase()}
            href={`/categories/${post.frontmatter.category}`}
          />
          <time dateTime={post.frontmatter.date}>{post.frontmatter.date}</time>
          <span className="text-text-dim">{post.frontmatter.readingTime} min read</span>
        </div>
        <h1 className="font-display text-post-h1 text-text-strong max-md:text-[22px]">
          {post.frontmatter.title}
        </h1>
        {post.frontmatter.description && (
          <p className="mt-22 text-[14px] leading-[2] text-text-muted">
            {post.frontmatter.description}
          </p>
        )}
        <div className="mt-22 flex flex-wrap gap-12 text-[11px] text-text-dim">
          {post.frontmatter.tags.map((tag) => (
            <Link
              key={tag}
              href={tagHref(tag)}
              className="hover:text-text-strong"
            >
              #{tag}
            </Link>
          ))}
        </div>
      </header>

      {/* 시리즈 박스 — 본문 진입 전 연재 컨텍스트, TOC 그리드 밖 (설계 §4.2) */}
      {series && <SeriesNav series={series} className="mb-56 max-w-780" />}

      {/* 본문 + 목차 그리드 (900–1199에서 목차 180px, max-lg에서 접힘 바가 본문 위) */}
      <div className="lg:grid lg:grid-cols-[1fr_216px] lg:items-start lg:gap-56 lg:max-xl:grid-cols-[1fr_180px]">
        <TableOfContents />

        <div className="min-w-0 lg:order-1">
          <article className="post-body">{mdxContent}</article>

          {/* 이전/다음 — 없는 쪽 미렌더, 모바일 세로 스택 */}
          <nav className="mt-64 flex justify-between gap-20 border-t border-rule pt-28 max-md:flex-col max-md:gap-18">
            {prev && (
              <Link href={`/posts/${prev.slug}`} className="hover:opacity-75">
                <p className="mb-8 text-[11px] text-text-dim">← PREV</p>
                <p className="max-w-300 text-[13px] leading-[1.8] text-text-muted">
                  {prev.title}
                </p>
              </Link>
            )}
            {next && (
              <Link
                href={`/posts/${next.slug}`}
                className="ml-auto text-right hover:opacity-75 max-md:ml-0 max-md:text-left"
              >
                <p className="mb-8 text-[11px] text-text-dim">NEXT →</p>
                <p className="max-w-300 text-[13px] leading-[1.8] text-text-muted">
                  {next.title}
                </p>
              </Link>
            )}
          </nav>

          <CommentSection postSlug={slug} initialComments={initialComments} />

          <FooterPrompt command="cd .." cursor className="mt-48" />
        </div>
      </div>
    </div>
  );
}
