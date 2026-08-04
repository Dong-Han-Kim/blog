'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

interface TerminalButtonProps {
  children: ReactNode;
  onClick?: () => void;
  /** 지정 시 <Link>로 렌더 (0건 액션 `$ cd ~` 등) */
  href?: string;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  'aria-label'?: string;
}

/**
 * 터미널 버튼 프리미티브 (설계 §5): 1px text-faint 테두리, 호버 시 테두리
 * accent + 글자 text-strong — 무전환 즉시 적용. 더 보기·0건 액션·스레드 토글 공용.
 */
export function TerminalButton({
  children,
  onClick,
  href,
  disabled = false,
  className,
  type = 'button',
  ...rest
}: TerminalButtonProps) {
  const baseClass = cn(
    'inline-flex items-center gap-8 border border-text-faint px-16 py-9 text-[12px] text-text-muted',
    disabled
      ? 'pointer-events-none border-rule-weak text-text-faint'
      : 'hover:border-accent hover:text-text-strong',
    className
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={baseClass} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={baseClass}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
