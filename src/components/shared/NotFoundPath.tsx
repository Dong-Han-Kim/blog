'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 404 화면의 요청 경로 표시 (설계 §7.8, R8).
 * 서버는 not-found에서 요청 URL에 접근할 수 없으므로 SSR은 `~` 폴백을 렌더하고,
 * 마운트 후 usePathname()의 실제 경로로 교체한다 (인라인 텍스트 교체 — CLS 없음).
 */
export function NotFoundPath() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !pathname) return <>~</>;
  return <>{pathname.replace(/^\//, '') || '~'}</>;
}
