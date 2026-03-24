'use client';

import Link from 'next/link';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-16">
      <h2 className="text-2xl font-bold">문제가 발생했어요</h2>
      <p className="text-gray-500">
        예상치 못한 오류가 발생했어요. 잠시 후 다시 시도해주세요.
      </p>
      <div className="flex gap-12">
        <button
          onClick={reset}
          className="px-16 py-8 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="px-16 py-8 border border-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
