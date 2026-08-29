'use client';

import { PromptLine } from '@/components/terminal/PromptLine';
import { TerminalButton } from '@/components/terminal/TerminalButton';

interface ErrorScreenProps {
  /** 프롬프트 라인 명령. 경계마다 다르므로 통일하지 않는다 (B-5.I2) */
  command: string;
  /**
   * 에러 문구 전문. **`error: ` 접두사를 포함해서** 넘긴다.
   * 접두사를 컴포넌트가 붙이지 않는 이유: 접두사를 붙이면 `error: {…}` 리터럴이
   * ErrorLine 외 지점에 생겨 B-6.1(정본 1곳)과 충돌한다.
   */
  message: string;
  reset: () => void;
}

/**
 * 에러 경계 공통 화면 (reuse-audit B-5 / C5).
 * 전역(app/error.tsx)과 상세(app/posts/[slug]/error.tsx)가 명령·문구를 제외하고
 * 25줄 전부 동일했다. 로깅·digest 표시는 추가하지 않는다 (B-5.4, YAGNI).
 */
export function ErrorScreen({ command, message, reset }: ErrorScreenProps) {
  return (
    <div className="mt-76">
      <PromptLine command={command} className="text-[13px]" />
      <p className="mt-16 text-[13px] leading-[2.2] text-error">{message}</p>
      <div className="mt-30 flex flex-wrap gap-12">
        <TerminalButton onClick={reset}>$ retry — 다시 시도</TerminalButton>
        <TerminalButton href="/">$ cd ~ — 홈으로</TerminalButton>
      </div>
    </div>
  );
}
