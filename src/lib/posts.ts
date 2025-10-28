import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import { remark } from 'remark';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import rehypePrismPlus from 'rehype-prism-plus';
import { PostMeta } from '../types/common';

const postsDirectory = path.join(process.cwd(), '/src/posts');

export function getAllPosts() {
  const categories = fs.readdirSync(postsDirectory);
  const allPosts = categories.flatMap((category) => {
    const categoryDir = path.join(postsDirectory, category);
    const files = fs.readdirSync(categoryDir);

    return files.map((file) => {
      const filePath = path.join(categoryDir, file);
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      const { data } = matter(fileContents);
      const { title, date, tags, description, draft, keywords, thumbnail } =
        data;

      return {
        category,
        slug: file.replace(/\.md$/, ''),
        title,
        date,
        tags,
        description,
        draft,
        keywords,
        thumbnail,
      };
    });
  });
  return allPosts;
}

export function getPostsByCategory(category: string): PostMeta[] | null {
  const categoryDir = path.join(postsDirectory, category);
  if (!fs.existsSync(categoryDir)) {
    return null;
  }
  const files = fs.readdirSync(categoryDir);

  return files.map((file) => {
    const filePath = path.join(categoryDir, file);
    const fileContents = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(fileContents);
    const { title, date, tags, description, draft, keywords, thumbnail } = data;

    return {
      category,
      slug: file.replace(/\.md$/, ''),
      title,
      date,
      tags,
      description,
      draft,
      keywords,
      thumbnail,
    };
  });
}

export async function getPostById(category: string, slug: string) {
  const filePath = path.join(postsDirectory, category, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const fileContents = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContents);
  const { title, date, tags, description, draft, keywords, thumbnail } = data;

  const processed = await remark()
    .use(remarkRehype) // Markdown → HTML AST
    .use(rehypeSanitize) // XSS 방지
    .use(rehypePrismPlus, {
      ignoreMissing: true,
      showLineNumbers: true,
      defaultLanguage: 'text',
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);
  const contentHtml = processed.toString();
  return {
    category,
    slug,
    content: contentHtml,
    title,
    date,
    tags,
    description,
    draft,
    keywords,
    thumbnail,
  };
}
