import { cn } from '@/lib/utils';
import { PromptLine } from './PromptLine';

interface FooterPromptProps {
  command: string;
  /** 상세 `cd ..`는 true, 홈 `exit`는 false (기본) */
  cursor?: boolean;
  /** margin은 소비처 지정 (홈 mt-60, 상세 mt-48 — 설계 §5) */
  className?: string;
}

/**
 * 페이지 푸터 프롬프트. 핸드오버 스펙: 프롬프트 text-dim + 명령 text-muted, 12px.
 */
export function FooterPrompt({
  command,
  cursor = false,
  className,
}: FooterPromptProps) {
  return (
    <PromptLine
      command={<span className="text-text-muted">{command}</span>}
      cursor={cursor}
      promptClassName="text-text-dim"
      className={cn('text-[12px]', className)}
    />
  );
}
