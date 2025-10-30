'use client';

import { CATEGORY_CONTENT } from '@/constants/category-content';
import { PostCard } from '@/types/common';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

function Card({
  slug,
  category,
  title,
  description,
  date,
  thumbnail,
  keywords,
}: PostCard) {
  const [isError, setIsError] = useState(false);

  const thumbnailUrl = Object.keys(CATEGORY_CONTENT).includes(category)
    ? category
    : 'etc';

  const handleImageError = (error: React.SyntheticEvent<HTMLImageElement>) => {
    if (!error) return;
    setIsError(true);
  };

  return (
    <article
      key={slug}
      className="w-full h-full border border-gray-300 rounded-lg hover:-translate-y-5 transition-transform duration-300 ease-in-out overflow-hidden"
    >
      <Link href={`/blog/${category}/${slug}`}>
        <div className="relative w-full h-180 mb-8">
          <Image
            src={
              !thumbnail || isError
                ? CATEGORY_CONTENT[thumbnailUrl].thumbnail
                : thumbnail
            }
            fill
            alt="thumbnail"
            onError={handleImageError}
          />
        </div>
        <div className="px-12 flex flex-col mb-8">
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
