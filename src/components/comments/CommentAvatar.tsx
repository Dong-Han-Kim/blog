import { cn } from '@/lib/utils';

interface CommentAvatarProps {
  name: string;
  /** filled = 일반 댓글(역상 블록), outline = 작성자(테두리) — 설계 §7.6 */
  variant: 'filled' | 'outline';
  className?: string;
}

// 한글 등 CJK는 글리프 폭 때문에 앞 1자, 그 외에는 소문자 앞 2자 (설계 §7.6)
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  if (/[㄰-㆏가-힣]/.test(trimmed[0])) return trimmed[0];
  return trimmed.slice(0, 2).toLowerCase();
}

/**
 * 이니셜 아바타 블록 (핸드오버 §2 댓글): 34×34(모바일 26×26), Galmuri14 14px.
 * filled: bg text-faint + 글자 bg / outline: 1px text-faint 테두리 + 글자 text-muted.
 */
export function CommentAvatar({ name, variant, className }: CommentAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-34 items-center justify-center font-display text-[14px] leading-none max-md:size-26 max-md:text-[12px]',
        variant === 'filled'
          ? 'bg-text-faint text-bg'
          : 'border border-text-faint text-text-muted',
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
