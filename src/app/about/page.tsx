import type { Metadata } from 'next';
import { PromptLine } from '@/components/terminal/PromptLine';
import { FooterPrompt } from '@/components/terminal/FooterPrompt';

export const metadata: Metadata = {
  title: '소개',
  description: '블로그 소개 페이지',
};

// 미디자인 — 콘텐츠 불변, prose(typography 플러그인) 제거 후 post-body 톤 상속 (설계 §7.10)
export default function AboutPage() {
  return (
    <>
      <PromptLine command="cat about.md" className="mt-40 mb-26" />
      <h1 className="mb-44 font-display text-wordmark text-text-strong max-md:text-[19px]">
        소개
      </h1>
      <div className="post-body max-w-780">
        <p>기술 블로그에 오신 것을 환영합니다.</p>
      </div>
      <FooterPrompt command="cd .." cursor className="mt-48" />
    </>
  );
}
