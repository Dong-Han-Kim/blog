import { cn } from '@/lib/utils/cn';

// 핸드오버 커서 블록: md 9×15(기본) / lg 11×20(워드마크) / sm 8×14(모바일)
const SIZE_CLASS = {
  sm: 'w-8 h-14',
  md: 'w-9 h-15',
  lg: 'w-11 h-20',
} as const;

interface BlinkCursorProps {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export function BlinkCursor({ size = 'md', className }: BlinkCursorProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block align-[-2px] bg-accent animate-blink',
        SIZE_CLASS[size],
        className
      )}
    />
  );
}
