import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '소개',
  description: '블로그 소개 페이지',
};

export default function AboutPage() {
  return (
    <div className="w-full px-10 md:px-20 lg:px-50 max-w-[800px] mx-auto">
      <h1 className="text-3xl font-bold mb-20">소개</h1>
      <div className="prose dark:prose-invert">
        <p>기술 블로그에 오신 것을 환영합니다.</p>
      </div>
    </div>
  );
}
