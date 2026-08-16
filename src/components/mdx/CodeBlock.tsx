'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';

type CodeBlockProps = ComponentProps<'pre'> & {
  /** rehype-pretty-code가 pre에 부착하는 언어명 (설계 §7.5) */
  'data-language'?: string;
};

/**
 * 코드블록 래퍼 (핸드오버 §2 코드블록): 1px rule 테두리 + bg-raised 패널,
 * 헤더 바(언어명 + `[ COPY ]` → 2초 `[ COPIED ]`), 본문 overflow-x 스크롤.
 * mdxComponents에서 `pre`에 매핑돼 모든 코드 펜스를 감싼다.
 * 줄번호 컬럼은 globals.css의 `[data-line]::before` CSS 카운터가 담당 (설계 §6.3,
 * 모바일에서 자동 제거). 하이라이트 3색은 lib/shiki-theme.ts의 커스텀 테마.
 */
export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 언마운트 시 COPIED 복원 타이머 정리 (리뷰 L-2)
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const language = props['data-language'] ?? 'text';

  const handleCopy = async () => {
    // ::before 줄번호는 textContent에 포함되지 않아 코드 원문만 복사된다
    const code = preRef.current?.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 클립보드 권한 거부/비보안 컨텍스트 — COPIED 표시 없이 조용히 무시 (리뷰 L-2)
      return;
    }
    setCopied(true);
    // 연타 시 이전 타이머를 교체해 마지막 클릭 기준 2초 유지
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-30 border border-rule bg-bg-raised">
      <div className="flex items-center justify-between border-b border-rule-inner px-14 py-8 text-[11px] text-text-dim">
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-text-dim hover:text-text-strong"
          aria-label="코드 복사"
        >
          {copied ? '[ COPIED ]' : '[ COPY ]'}
        </button>
      </div>
      <pre
        ref={preRef}
        {...props}
        className={cn(
          'overflow-x-auto p-[14px_16px] text-[13px] leading-[2.1] text-text-body max-md:p-12 max-md:text-[12px] max-md:leading-[2]',
          className
        )}
      >
        {children}
      </pre>
    </div>
  );
}
