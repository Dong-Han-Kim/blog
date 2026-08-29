import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// 기존 콘텐츠 호환을 위해 타입 4종 유지, 라벨만 `! {LABEL}` 패턴으로 매핑 (설계 §7.5)
const LABELS = {
  info: '! NOTE',
  tip: '! TIP',
  warning: '! WARN',
  danger: '! ERROR',
} as const;

interface CalloutProps {
  type?: keyof typeof LABELS;
  title?: string;
  children: ReactNode;
}

/**
 * NOTE 콜아웃 (핸드오버 §2): 1px accent 테두리 + bg-hover, 라벨 11px accent,
 * 본문 13px/2.05 text-body. danger만 error 색 계열.
 */
export function Callout({ type = 'info', title, children }: CalloutProps) {
  const isDanger = type === 'danger';

  return (
    <aside
      className={cn(
        'my-30 border bg-bg-hover p-[18px_20px]',
        isDanger ? 'border-error' : 'border-accent'
      )}
    >
      <p className={cn('mb-10 text-[11px]', isDanger ? 'text-error' : 'text-accent')}>
        {LABELS[type]}
        {title ? ` — ${title}` : ''}
      </p>
      <div className="text-[13px] leading-[2.05] text-text-body">{children}</div>
    </aside>
  );
}
