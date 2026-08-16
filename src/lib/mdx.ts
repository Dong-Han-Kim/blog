import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { postFrontmatterSchema } from './validations/posts';
import { calcReadingTime } from './reading-time';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PostMeta } from '@/types/common';

const postsDirectory = path.join(process.cwd(), 'content', 'posts');

export function getAllPosts(): PostMeta[] {
  try {
    const categories = fs.readdirSync(postsDirectory);

    const allPosts = categories.flatMap((category) => {
      const categoryDir = path.join(postsDirectory, category);
      if (!fs.statSync(categoryDir).isDirectory()) return [];

      const files = fs
        .readdirSync(categoryDir)
        .filter((file) => file.endsWith('.md'));

      return files.map((file) => {
        const filePath = path.join(categoryDir, file);
        const fileContents = fs.readFileSync(filePath, 'utf-8');
        const { data, content } = matter(fileContents);
        const frontmatter = postFrontmatterSchema.parse(data);

        return {
          ...frontmatter,
          slug: file.replace(/\.md$/, ''),
          readingTime: calcReadingTime(content),
        };
      });
    });

    return allPosts;
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error(`Frontmatter validation error: ${error.message}`);
      redirect('/');
    } else if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      notFound();
    } else {
      console.error(`Error reading posts: ${error}`);
      redirect('/');
    }
  }
}

export function getPostBySlug(slug: string) {
  try {
    const categories = fs.readdirSync(postsDirectory);

    for (const category of categories) {
      const categoryDir = path.join(postsDirectory, category);
      if (!fs.statSync(categoryDir).isDirectory()) continue;

      const filePath = path.join(categoryDir, `${slug}.md`);
      if (!fs.existsSync(filePath)) continue;

      const file = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(file);
      const frontmatter = postFrontmatterSchema.parse(data);

      return {
        frontmatter: { ...frontmatter, slug, readingTime: calcReadingTime(content) },
        content,
      };
    }
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error(`Error reading post ${slug}: ${error.message}`);
      redirect('/');
    } else if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      notFound();
    } else {
      console.error(`Error reading post ${slug}: ${error}`);
      redirect('/');
    }
  }

  // 슬러그 미존재 — try 안에서 던지면 catch가 NEXT_HTTP_ERROR를 삼키고
  // redirect('/')로 낙하하므로(소프트 404) 반드시 try 밖에서 던진다 (QA-H1)
  notFound();
}

export function getPostsByCategory(category: string): PostMeta[] {
  try {
    const categoryDir = path.join(postsDirectory, category);
    const files = fs
      .readdirSync(categoryDir)
      .filter((file) => file.endsWith('.md'));

    return files.map((file) => {
      const filePath = path.join(categoryDir, file);
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContents);
      const frontmatter = postFrontmatterSchema.parse(data);

      return {
        ...frontmatter,
        slug: file.replace(/\.md$/, ''),
        readingTime: calcReadingTime(content),
      };
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error(
        `Frontmatter validation error in category ${category}: ${error.message}`
      );
      redirect('/');
    } else if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    } else {
      console.error(`Error reading category ${category}: ${error}`);
      redirect('/');
    }
  }
}

export function getPostsByTag(tag: string): PostMeta[] {
  const allPosts = getAllPosts();
  return allPosts.filter((post) => post.tags.includes(tag));
}

/** 시리즈 파생 정보. slug 기준 1회 계산해 페이지에 전달 (설계 §3) */
export interface SeriesInfo {
  /** 시리즈명 (표시용, trim 적용) */
  name: string;
  /** draft 제외, sortSeriesPosts 규칙으로 정렬된 전체 편 목록 */
  posts: PostMeta[];
  /** posts 내 현재 글 인덱스 (0-based). 현재 글이 draft면 -1 */
  currentIndex: number;
  /** 시리즈 내 이전/다음 편 (없거나 currentIndex === -1이면 null) */
  prev: PostMeta | null;
  next: PostMeta | null;
}

/**
 * 시리즈 정렬 정본 (설계 §3.1) — 컴포넌트는 이 순서를 그대로 신뢰한다.
 * 1. seriesOrder ?? Infinity (order 있는 편이 앞, 누락 편은 뒤)
 * 2. date 오름차순 (동률 시)
 * 3. slug localeCompare (최종 결정성 — proxy 3부작처럼 date 전부 동일 케이스 대비)
 * 표시 번호는 seriesOrder 원값이 아니라 정렬 후 배열 인덱스 + 1을 쓴다.
 */
export function sortSeriesPosts(posts: PostMeta[]): PostMeta[] {
  return [...posts].sort((a, b) => {
    const orderA = a.seriesOrder ?? Number.POSITIVE_INFINITY;
    const orderB = b.seriesOrder ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    // date는 YYYY-MM-DD 고정 형식이라 문자열 비교가 시간순과 일치한다
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * 이미 로드된 전체 포스트에서 시리즈 편 목록을 도출한다.
 * getSeriesForPost가 getAllPosts() 1회 결과를 재사용하기 위한 내부 정본 —
 * 필터(draft 제외, trim 후 완전 일치)와 정렬(sortSeriesPosts) 규칙은 여기 한 곳에만 둔다.
 */
function filterSeriesPosts(allPosts: PostMeta[], seriesName: string): PostMeta[] {
  const name = seriesName.trim();
  return sortSeriesPosts(
    allPosts.filter((post) => !post.draft && post.series?.trim() === name)
  );
}

/** 시리즈명이 일치(trim 후 완전 일치)하는 비-draft 포스트를 정렬해 반환 */
export function getPostsBySeries(seriesName: string): PostMeta[] {
  return filterSeriesPosts(getAllPosts(), seriesName);
}

/**
 * 해당 slug 글의 시리즈 컨텍스트를 도출한다. 글이 시리즈 미소속이면 null.
 * 내부에서 getAllPosts()만 사용(빌드 타임 파일시스템) — 에러 처리는 거기에 위임하고
 * 자체 try/catch를 두지 않는다 (동일 진입점 이중 래핑 시 redirect 중복 위험, 설계 §3.2)
 */
export function getSeriesForPost(slug: string): SeriesInfo | null {
  const allPosts = getAllPosts();
  const current = allPosts.find((post) => post.slug === slug);
  if (!current) return null;

  if (!current.series) {
    if (current.seriesOrder !== undefined) {
      console.warn(
        `[series] ${slug}: seriesOrder만 있고 series가 없어 시리즈로 취급하지 않습니다.`
      );
    }
    return null;
  }

  // getAllPosts() 재호출 없이 위에서 읽은 allPosts를 재사용 (요청당 md 파싱 1회)
  const posts = filterSeriesPosts(allPosts, current.series);
  // 시리즈 전 편이 draft면 발행 편 0 → 박스 미렌더 (설계 §6.4)
  if (posts.length === 0) return null;

  const currentIndex = posts.findIndex((post) => post.slug === slug);
  return {
    name: current.series.trim(),
    posts,
    currentIndex,
    prev: currentIndex > 0 ? posts[currentIndex - 1] : null,
    next:
      currentIndex >= 0 && currentIndex < posts.length - 1
        ? posts[currentIndex + 1]
        : null,
  };
}
