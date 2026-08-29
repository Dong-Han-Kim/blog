'use client';

import { ErrorScreen } from '@/components/shared/ErrorScreen';

// 상세 에러 경계 — CRT 톤 최소 적용 (설계 §7.8): 프롬프트 + error 라인 + reset 버튼
export default function PostError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      command="cat posts/….md"
      message="error: 페이지를 불러올 수 없습니다. 잠시 후 다시 시도해주세요."
      reset={reset}
    />
  );
}
