import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BlinkCursor } from './BlinkCursor';

export const PROMPT = 'blog92@web:~$';

interface PromptLineProps {
  command: ReactNode;
  /** true면 명령 뒤에 blink 커서를 붙인다 */
  cursor?: boolean;
  className?: string;
  /** 프롬프트(`blog92@web:~$`) 색 오버라이드 — 기본 text-faint */
  promptClassName?: string;
}

/**
 * 셸 프롬프트 라인 프리미티브 (설계 §5).
 * 브레드크럼·404·로딩·푸터 공용. 기본 12px, 프롬프트 text-faint + 명령 text-dim.
 * 크기·색이 다른 소비처는 className/promptClassName으로 오버라이드한다.
 */
export function PromptLine({
  command,
  cursor = false,
  className,
  promptClassName,
}: PromptLineProps) {
  return (
    <p className={cn('text-[12px] text-text-dim', className)}>
      <span className={cn('text-text-faint', promptClassName)}>{PROMPT}</span>{' '}
      {command}
      {cursor && <BlinkCursor className="ml-8" />}
    </p>
  );
}
