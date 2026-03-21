import Image from 'next/image';

interface ImageWithCaptionProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export function ImageWithCaption({
  src,
  alt,
  caption,
  width = 800,
  height = 400,
}: ImageWithCaptionProps) {
  return (
    <figure className="my-24">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="rounded-lg mx-auto"
      />
      {caption && (
        <figcaption className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
