import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DottedRuleProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

/**
 * 좌 라벨 + 점선 룰 + 우 라벨 (설계 §5).
 * 목록 헤더 줄(`{n} ENTRIES … SORTED BY DATE ↓`), 댓글 헤더, DID YOU MEAN 공용.
 * 점선: 핸드오버 4px/8px repeating-gradient(색은 text-faint 토큰).
 */
export function DottedRule({ left, right, className }: DottedRuleProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-14 text-[11px] text-text-dim',
        className
      )}
    >
      {left != null && <span className="shrink-0">{left}</span>}
      <span
        aria-hidden
        className="h-1 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-text-faint)_0_4px,transparent_4px_8px)]"
      />
      {right != null && <span className="shrink-0">{right}</span>}
    </div>
  );
}
