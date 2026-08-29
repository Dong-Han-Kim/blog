import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ErrorLineProps {
  /** `error: ` 접두사 뒤 문구. falsy면 DOM 노드를 만들지 않는다 (B-6.I4) */
  message?: ReactNode;
  /** 여백 전용 추가 클래스 (`mt-8` / `px-16 pb-12` / `mt-6`). 소비처마다 다르다 */
  className?: string;
}

/**
 * 폼·다이얼로그 필드 에러 라인 정본 (reuse-audit B-6 / C7).
 * `error: ` 접두사(콜론+공백)와 11px error 타이포를 고정한다.
 *
 * cn 인자 순서가 (className, base)인 것은 의도다 — ① 소비처가 타이포·색을 덮지 못하게 하고
 * ② 치환 전 클래스 문자열 순서(`mt-8 text-[11px] text-error`)를 바이트 그대로 보존한다.
 * ui/form.tsx의 FormMessage는 같은 타이포를 쓰지만 `error: ` 접두사가 없는 shadcn
 * 생성물이므로 통합 대상이 아니다 (B-6.3).
 */
export function ErrorLine({ message, className }: ErrorLineProps) {
  if (!message) return null;

  return (
    <p className={cn(className, 'text-[11px] text-error')}>error: {message}</p>
  );
}
