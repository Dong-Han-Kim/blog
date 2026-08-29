'use client';

import { ErrorScreen } from '@/components/shared/ErrorScreen';

// 전역 에러 경계 — CRT 톤 최소 적용 (설계 §7.8): 프롬프트 + error 라인 + reset 버튼
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      command="./blog92 --render"
      message="error: 예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      reset={reset}
    />
  );
}
