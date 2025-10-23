'use client';

import { PostCard } from '@/types/common';
import Image from 'next/image';
import Link from 'next/link';
import { DefaultImage } from '@/types/common';
import { useState } from 'react';

const DEFAULT_THUMBNAIL: DefaultImage = {
  html: '/thumbnail/html.jpg',
  css: '/thumbnail/CSS.jpg',
  js: '/thumbnail/javaScript.jpg',
  react: '/thumbnail/react.jpg',
  etc: '/thumbnail/etc.jpg',
};

function Card({
  slug,
  category,
  title,
  description,
  date,
  thumbnail,
}: PostCard) {
  const [isError, setIsError] = useState(false);

  const thumbnailUrl = Object.keys(DEFAULT_THUMBNAIL).includes(category)
    ? category
    : 'etc';

  const handleImageError = (error: React.SyntheticEvent<HTMLImageElement>) => {
    if (!error) return;
    setIsError(true);
  };

  return (
    <article key={slug} className="p-12 mb-8">
      <Link href={`/blog/${category}/${slug}`}>
        <Image
          src={
            !thumbnail || isError ? DEFAULT_THUMBNAIL[thumbnailUrl] : thumbnail
          }
          width={300}
          height={300}
          alt="thumbnail"
          onError={handleImageError}
        />
        <h3 className="text-2xl font-extrabold">{title}</h3>
        <p>{description}</p>
        <p className="text-gray-300 text-sm">{date}</p>
      </Link>
    </article>
  );
}

export default Card;
