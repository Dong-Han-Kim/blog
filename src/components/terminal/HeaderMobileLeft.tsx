'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BlinkCursor } from './BlinkCursor';

const POST_DETAIL_RE = /^\/posts\/[^/]+\/?$/;

/**
 * 헤더 좌측 (설계 §2.6): 기본은 워드마크. 모바일(≤767px)에서 포스트 상세
 * (`/posts/{slug}`)에 있으면 워드마크 대신 `← posts/` 뒤로가기를 렌더한다.
 * 라우트별 layout 분기 대신 클라이언트 한 점에서 usePathname으로 판단.
 * 워드마크 blink 커서는 상세에서 미표시 (핸드오버: 상세 헤더는 커서 없음).
 */
export function HeaderMobileLeft() {
  const pathname = usePathname();
  const isPostDetail = POST_DETAIL_RE.test(pathname);

  return (
    <>
      {isPostDetail && (
        <Link
          href="/"
          className="md:hidden text-[13px] text-text-muted hover:text-text-strong"
        >
          ← posts/
        </Link>
      )}
      <Link
        href="/"
        aria-label="b.log() 홈"
        className={cn(
          'font-display text-wordmark text-text-strong max-md:text-[19px]',
          isPostDetail && 'max-md:hidden'
        )}
      >
        b.log()
        {!isPostDetail && (
          <BlinkCursor size="lg" className="ml-8 max-md:h-14 max-md:w-8" />
        )}
      </Link>
    </>
  );
}
