'use client';

import { PromptLine } from '@/components/terminal/PromptLine';
import { TerminalButton } from '@/components/terminal/TerminalButton';

// 전역 에러 경계 — CRT 톤 최소 적용 (설계 §7.8): 프롬프트 + error 라인 + reset 버튼
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mt-76">
      <PromptLine command="./blog92 --render" className="text-[13px]" />
      <p className="mt-16 text-[13px] leading-[2.2] text-error">
        error: 예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <div className="mt-30 flex flex-wrap gap-12">
        <TerminalButton onClick={reset}>$ retry — 다시 시도</TerminalButton>
        <TerminalButton href="/">$ cd ~ — 홈으로</TerminalButton>
      </div>
    </div>
  );
}
