'use client';

import { cn } from '@/lib/utils';

interface SearchTriggerProps {
  className?: string;
}

function openPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true })
  );
}

/** 데스크톱(≥768px): `검색... ⌘K` 12px 플레인 텍스트 버튼 (핸드오버 #6cd08f = text-hint) */
export function SearchTrigger({ className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'max-md:hidden text-[12px] text-text-hint hover:text-text-strong',
        className
      )}
      onClick={openPalette}
    >
      검색... ⌘K
    </button>
  );
}

/**
 * 모바일(≤767px): `⌘K` 1px rule 테두리 박스(padding 5px 9px).
 * 44px 히트영역은 바깥 버튼 패딩으로 확보하고 시각 박스는 핸드오버 수치 유지.
 */
export function SearchTriggerMobile({ className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'md:hidden inline-flex min-h-44 min-w-44 items-center justify-center',
        className
      )}
      onClick={openPalette}
      aria-label="⌘K 검색"
    >
      <span className="border border-rule px-9 py-5 text-[11px] text-text-muted">
        ⌘K
      </span>
    </button>
  );
}
