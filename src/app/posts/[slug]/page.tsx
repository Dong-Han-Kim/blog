import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

import { getAllPosts, getPostBySlug } from '@/lib/mdx';
import { Callout, CodeBlock, ImageWithCaption } from '@/components/mdx';
import { TableOfContents } from '@/components/posts/TableOfContents';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { comments } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { CommentSection } from '@/components/comments/CommentSection';
import type { Comment } from '@/types/comment';

// Comments are fetched at request time; disable static prerendering for this route
export const dynamic = 'force-dynamic';

const mdxComponents = {
  Callout,
  CodeBlock,
  ImageWithCaption,
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
  const allPosts = getAllPosts()
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [rehypePrettyCode, { theme: 'github-dark-default', keepBackground: true }],
        ],
      },
    },
  });

  const { prev, next } = getAdjacentPosts(slug);

  let initialComments: Comment[] = [];
  try {
    const rawComments = await db
      .select({
        id: comments.id,
        postSlug: comments.postSlug,
        authorName: comments.authorName,
        content: comments.content,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .where(eq(comments.postSlug, slug))
      .orderBy(asc(comments.createdAt));

    initialComments = rawComments.map((c) => ({
      ...c,
      parentId: c.parentId ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt?.toISOString() ?? null,
    }));
  } catch (error) {
    console.error('댓글 조회 실패:', error);
  }

  return (
    <div className="w-full px-16 md:px-24 lg:px-48">
      <div className="flex justify-center">
        <article className="w-full max-w-[800px]">
          <header className="mb-32">
            <div className="flex items-center gap-8 text-sm text-gray-500 dark:text-gray-400 mb-12">
              <Link
                href={`/categories/${post.frontmatter.category}`}
                className="hover:text-blue-500 transition-colors"
              >
                {post.frontmatter.category}
              </Link>
              <span>·</span>
              <time>{post.frontmatter.date}</time>
            </div>
            <h1 className="text-4xl font-bold mb-16 leading-tight">
              {post.frontmatter.title}
            </h1>
            {post.frontmatter.description && (
              <p className="text-lg text-gray-600 dark:text-gray-400">
                {post.frontmatter.description}
              </p>
            )}
            <div className="flex flex-wrap gap-8 mt-16">
              {post.frontmatter.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tags/${tag}`}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          </header>

          <div className="prose prose-lg dark:prose-invert max-w-none">
            {mdxContent}
          </div>

          <nav className="mt-48 pt-32 border-t border-gray-200 dark:border-gray-700 flex justify-between">
            {prev ? (
              <Link
                href={`/posts/${prev.slug}`}
                className="group flex flex-col"
              >
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  이전 글
                </span>
                <span className="group-hover:text-blue-500 transition-colors">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                href={`/posts/${next.slug}`}
                className="group flex flex-col items-end"
              >
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  다음 글
                </span>
                <span className="group-hover:text-blue-500 transition-colors">
                  {next.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </nav>

          <CommentSection postSlug={slug} initialComments={initialComments} />
        </article>

        <TableOfContents />
      </div>
    </div>
  );
}
