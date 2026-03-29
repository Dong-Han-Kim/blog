'use client';

import { PostCard } from '@/types/common';
import Image from 'next/image';
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
    <article
      key={slug}
      className="w-full h-full border border-gray-300 rounded-lg hover:-translate-y-5 transition-transform duration-300 ease-in-out overflow-hidden"
    >
      <Link href={`/posts/${slug}`}>
        <div className="px-12 pt-16 flex flex-col mb-8">
          <span className="text-xs text-gray-400 mb-8">{category}</span>
          <h3 className="text-2xl font-extrabold mb-8 text-nowrap text-ellipsis overflow-hidden">
            {title}
          </h3>
          <p className="mb-20 text-nowrap text-ellipsis overflow-hidden">
            {description}
          </p>
          <ul className="flex gap-5 text-xs justify-end">
            {keywords.map((keyword, i) => {
              return (
                <li
                  key={keyword + i}
                  className="text-gray-400"
                >{`#${keyword}`}</li>
              );
            })}
          </ul>
        </div>
        <div className="text-gray-400 text-sm mb-8 flex items-center gap-2 border-t border-t-gray-300 pt-12 px-12">
          <Image
            src={'/icons/calendar-gray.svg'}
            width={18}
            height={18}
            alt="date calender"
          />
          {date}
        </div>
      </Link>
    </article>
  );
}

export default Card;
