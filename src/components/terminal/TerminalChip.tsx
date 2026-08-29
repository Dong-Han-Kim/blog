import type { ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/** outline = 테두리 칩(기본), filled = 역상 accent 칩(현재 항목 표시) */
type TerminalChipVariant = 'outline' | 'filled';

interface TerminalChipProps {
  children: ReactNode;
  /** 지정 시 <Link>(<a>)로 렌더. onClick과 동시에 지정하지 않는다 */
  href?: string;
  /**
   * 지정 시 <button type="button">로 렌더.
   * ⚠️ 이 컴포넌트에는 'use client'가 없다. onClick은 **클라이언트 컴포넌트에서만** 넘길 것 —
   *    서버 컴포넌트에서 함수를 넘기면 Next가 직렬화 오류를 낸다.
   */
  onClick?: () => void;
  variant?: TerminalChipVariant;
  /** href·onClick이 없는 <span> 렌더 시 현재 항목 표시 */
  ariaCurrent?: 'page' | 'true';
  className?: string;
}

/**
 * 11px 터미널 칩 프리미티브 (reuse-audit D-2 / C1-b).
 * 태그 목록·검색 TRY 칩·스레드 토글·태그 인덱스 패널 6곳이 같은 클래스 문자열을
 * 복붙하며 패딩이 두 갈래(px-10 py-5 / px-9 py-4)로 분화했다.
 *
 * 'use client'를 **두지 않는 것이 요구사항**이다 (D-2.2). tags/page.tsx는 서버 컴포넌트이고
 * 칩 N개마다 클라이언트 경계를 만들면 정적 페이지의 JS 페이로드가 늘어난다.
 * ui/Button(variant="outline" size="sm")이 스펙상 동일하지만 클라이언트 컴포넌트라 쓸 수 없다.
 *
 * 이름이 TagChip이 아닌 이유: CommentItem의 스레드 토글은 태그가 아니다. 의미가 아니라
 * 시각 프리미티브를 공유한다.
 *
 * base에 display를 inline-block으로 두는 이유: flex 컨테이너의 직계 자식으로 쓰이는
 * 소비처(tags/page, SearchCommand)는 blockify돼 영향이 없고, li 안에 들어가는
 * TagIndexPanel은 inline이면 패딩이 줄 높이에 반영되지 않는다. inline-flex를 base로
 * 두면 `#태그 {count}` 사이 공백이 flex 처리에서 사라진다.
 */
const CHIP_BASE = 'inline-block px-10 py-5 text-[11px]';

const CHIP_VARIANT: Record<TerminalChipVariant, string> = {
  outline:
    'border border-text-faint text-text-muted hover:border-accent hover:text-text-strong',
  // 투명 보더로 보더 박스를 outline 칩과 같은 높이(28.5px)로 맞춘다 — 없으면 26.5px라 형제 칩과 2px 어긋난다 (D-2.6). ui/button.tsx base가 같은 기법을 쓴다
  filled: 'border border-transparent bg-accent text-bg',
};

export function TerminalChip({
  children,
  href,
  onClick,
  variant = 'outline',
  ariaCurrent,
  className,
}: TerminalChipProps) {
  const chipClass = cn(CHIP_BASE, CHIP_VARIANT[variant], className);

  if (href) {
    return (
      <Link href={href} className={chipClass}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={chipClass}>
        {children}
      </button>
    );
  }

  return (
    <span aria-current={ariaCurrent} className={chipClass}>
      {children}
    </span>
  );
}
