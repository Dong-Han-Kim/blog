import { PostCard } from '@/types/common';
import Link from 'next/link';

function Card({
  slug,
  category,
  title,
  description,
  date,
  keywords,
}: PostCard) {
  return (
    <article key={slug}>
      <Link
        href={`/posts/${slug}`}
        className="block border-l-2 border-gray-900 dark:border-gray-200 pl-16 py-12 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="text-xs uppercase tracking-[2px] text-muted-foreground">
          {category}
        </span>
        <h3 className="text-lg font-semibold mt-4 mb-4 line-clamp-1">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-1 mb-12">
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
