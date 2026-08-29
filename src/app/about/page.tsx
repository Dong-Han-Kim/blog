import type { Metadata } from 'next';
import { IndexPageShell } from '@/components/shared/IndexPageShell';

export const metadata: Metadata = {
  title: '소개',
  description: '블로그 소개 페이지',
};

// 미디자인 — 콘텐츠 불변, prose(typography 플러그인) 제거 후 post-body 톤 상속 (설계 §7.10)
export default function AboutPage() {
  return (
    <IndexPageShell command="cat about.md" title="소개">
      <div className="post-body max-w-780">
        <p>기술 블로그에 오신 것을 환영합니다.</p>
      </div>
    </IndexPageShell>
  );
}
