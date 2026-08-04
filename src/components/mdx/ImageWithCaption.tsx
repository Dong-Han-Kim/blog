import Image from 'next/image';

interface ImageWithCaptionProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * 이미지 (핸드오버 §9): 1px text-faint 박스 + `[ IMAGE — {설명} ]` 캡션(11px text-faint).
 * 이미지 로딩 중에도 같은 박스가 자리를 지킨다.
 */
export function ImageWithCaption({
  src,
  alt,
  caption,
  width = 800,
  height = 400,
}: ImageWithCaptionProps) {
  return (
    <figure className="my-30">
      <div className="border border-text-faint">
        <Image src={src} alt={alt} width={width} height={height} className="mx-auto" />
      </div>
      <figcaption className="mt-8 text-center text-[11px] text-text-faint">
        [ IMAGE — {caption ?? alt} ]
      </figcaption>
    </figure>
  );
}
