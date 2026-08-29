import type { ReactNode } from 'react';

import { FooterPrompt } from '@/components/terminal/FooterPrompt';
import { PromptLine } from '@/components/terminal/PromptLine';

interface IndexPageShellProps {
  /** 상단 프롬프트 명령. 페이지 정체성이므로 통일하지 않는다 (D-3.I1) */
  command: string;
  /** 페이지 h1 텍스트. 문서 내 유일 h1 계약을 이 셸이 보증한다 (D-3.I4) */
  title: string;
  children: ReactNode;
}

/**
 * 미디자인 인덱스 페이지 공통 셸 (reuse-audit D-3 / C2).
 * /posts · /categories · /tags · /about 4곳이 아래 3요소를 **바이트 동일**하게 복제했다:
 *   PromptLine(mt-40 mb-26) + h1(mb-44 wordmark) + FooterPrompt('cd ..', cursor, mt-48).
 *
 * 'use client'를 두지 않는다 — 4개 페이지의 서버 컴포넌트 성질을 유지해야 한다 (D-3.2).
 * 각 페이지의 `export const metadata`는 page.tsx에 그대로 남긴다 (Next.js 규약, D-3.5).
 * FooterPrompt의 `cd ..`와 cursor는 4곳이 전부 동일해 prop으로 열지 않는다 (D-3.4).
 * 상세 페이지(categories/[category], tags/[tag])는 구조가 달라 이 셸을 쓰지 않는다 (D-3.I5).
 */
export function IndexPageShell({
  command,
  title,
  children,
}: IndexPageShellProps) {
  return (
    <>
      <PromptLine command={command} className="mt-40 mb-26" />
      <h1 className="mb-44 font-display text-wordmark text-text-strong max-md:text-[19px]">
        {title}
      </h1>
      {children}
      <FooterPrompt command="cd .." cursor className="mt-48" />
    </>
  );
}
