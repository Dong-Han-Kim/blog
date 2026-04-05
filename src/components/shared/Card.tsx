import { PostCard } from '@/types/common';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

const categoryLineColor: Record<string, string> = {
  frontend: 'border-blue-500 dark:border-blue-400',
  backend: 'border-emerald-500 dark:border-emerald-400',
  devops: 'border-amber-500 dark:border-amber-400',
  database: 'border-violet-500 dark:border-violet-400',
  projects: 'border-cyan-500 dark:border-cyan-400',
  til: 'border-rose-400 dark:border-rose-400',
  nextjs: 'border-slate-500 dark:border-slate-400',
};

function getCategoryColor(category: string) {
  return categoryLineColor[category.toLowerCase()] ?? 'border-gray-900 dark:border-gray-200';
}

function Card({
  slug,
  category,
  title,
  description,
  date,
  keywords,
  featured = false,
}: PostCard) {
  return (
    <article className={cn(featured && 'md:col-span-2')}>
      <Link
        href={`/posts/${slug}`}
        className={cn(
          'block border-l-2 pl-16 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors',
          getCategoryColor(category),
          featured ? 'py-20' : 'py-12',
        )}
      >
        <span className="text-xs uppercase tracking-[2px] text-muted-foreground">
          {category}
        </span>
        <h3
          className={cn(
            'font-semibold mt-4 mb-4 line-clamp-2',
            featured ? 'text-2xl' : 'text-lg line-clamp-1',
          )}
        >
          {title}
        </h3>
        {description && (
          <p
            className={cn(
              'text-sm text-muted-foreground mb-12',
              featured ? 'line-clamp-2' : 'line-clamp-1',
            )}
          >
            {description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <time className="text-xs text-muted-foreground">{date}</time>
          <div className="flex gap-8 text-xs text-muted-foreground">
            {keywords.map((keyword, i) => (
              <span key={keyword + i}>#{keyword}</span>
            ))}
          </div>
        </div>
      </Link>
    </article>
  );
}

export default Card;
