import Link from 'next/link';
import { cn } from '@/lib/utils';

interface CategoryBadgeProps {
  category: string;
  href?: string;
  className?: string;
}

/**
 * 역상 카테고리 배지 (설계 §5): 배경 text-dim + 글자 bg, 11px, padding 3px 8px.
 * (배경은 원래 text-faint — WCAG AA 대비 3.82로 불합격이라 text-dim 승급, QA fix-contrast-aa)
 * href가 있으면 링크 + 호버 시 배경 accent (핸드오버 역상 호버 규칙).
 */
export function CategoryBadge({ category, href, className }: CategoryBadgeProps) {
  const badgeClass = cn(
    // text-meta(명명 토큰)는 tailwind-merge가 색상으로 오인해 뒤의 text-bg에 밀려
    // 제거된다 — 11px가 실제로 적용되도록 arbitrary 값으로 고정한다 (reuse-audit D-1)
    'inline-block bg-text-dim px-8 py-3 text-[11px] leading-none text-bg',
    className
  );

  if (href) {
    return (
      <Link href={href} className={cn(badgeClass, 'hover:bg-accent')}>
        {category}
      </Link>
    );
  }

  return <span className={badgeClass}>{category}</span>;
}
