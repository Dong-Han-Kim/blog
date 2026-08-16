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
