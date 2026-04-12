import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center gap-16">
      <h1 className="font-mono text-[120px] font-bold leading-none tracking-[16px] text-muted-foreground select-none">
        404
      </h1>
      <p className="text-lg text-muted-foreground">
        페이지를 찾을 수 없습니다.
      </p>
      <Link
        href="/"
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
